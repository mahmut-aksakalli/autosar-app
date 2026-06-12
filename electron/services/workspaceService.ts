import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type {
  ArxmlDocumentData,
  ArxmlDocumentSummary,
  ExplorerEntry,
  OpenWorkspaceResult,
  ValidationScope,
  WorkspaceProjectInfo,
  WorkspaceSnapshot
} from "../../src/shared/contracts.js";
import { WorkerPool } from "./workerPool.js";
import { AutosarSemanticValidationService } from "./autosarSemanticValidationService.js";
import { discoverVectorProject, type VectorProjectDiscovery } from "./vectorProjectService.js";
import { enrichPortCommunicationSpecsFromEntities } from "./autosarModel.js";

export class WorkspaceService {
  private readonly events = new EventEmitter();
  private readonly workerPool = new WorkerPool();
  private readonly semanticValidationService = new AutosarSemanticValidationService();
  private watcher?: FSWatcher;
  private rootPath?: string;
  private validationScopeMode: ValidationScope = "single-file";
  private watchTargets: string[] = [];
  private workspace?: WorkspaceSnapshot;
  private documentCache = new Map<string, ArxmlDocumentData>();
  private explorerEntries: ExplorerEntry[] = [];
  private project?: WorkspaceProjectInfo;
  private vectorProjectInputPaths = new Set<string>();
  private workspaceGeneration = 0;

  async openWorkspace(rootPath: string): Promise<OpenWorkspaceResult> {
    const generation = this.workspaceGeneration + 1;
    this.workspaceGeneration = generation;
    this.rootPath = rootPath;
    this.validationScopeMode = "single-file";
    this.documentCache.clear();
    this.explorerEntries = await collectExplorerEntries(rootPath);
    const vectorProject = await discoverVectorProject(rootPath, this.explorerEntries);
    this.project = vectorProject?.project ?? {
      kind: "folder",
      displayName: path.basename(rootPath),
      metadataFiles: [],
      inputFiles: [],
      indexedInBackground: false,
      indexingStatus: "idle"
    };
    this.vectorProjectInputPaths = new Set(vectorProject?.projectInputFilePaths ?? []);
    this.validationScopeMode = vectorProject ? "workspace" : "single-file";
    this.watchTargets = [path.join(rootPath, "**/*.arxml")];
    this.workspace = this.buildSnapshot([]);
    await this.startWatching();
    if (vectorProject) {
      void this.indexVectorProjectInBackground(vectorProject, generation);
    }
    return {
      workspace: this.workspace
    };
  }

  async openFile(filePath: string): Promise<OpenWorkspaceResult> {
    this.workspaceGeneration += 1;
    this.rootPath = path.dirname(filePath);
    this.validationScopeMode = "single-file";
    this.documentCache.clear();
    this.project = {
      kind: "single-file",
      displayName: path.basename(filePath),
      metadataFiles: [],
      inputFiles: [
        {
          filePath,
          relativePath: path.basename(filePath)
        }
      ],
      indexedInBackground: false,
      indexingStatus: "idle"
    };
    this.vectorProjectInputPaths.clear();
    this.explorerEntries = [
      {
        name: path.basename(filePath),
        relativePath: path.basename(filePath),
        filePath,
        kind: "file",
        openable: true
      }
    ];
    this.watchTargets = [filePath];
    const document = await this.parseDocument(filePath);
    this.workspace = this.buildSnapshot([document]);
    await this.startWatching();
    return {
      workspace: this.workspace,
      firstFile: document
    };
  }

  getSnapshot() {
    return this.workspace ?? null;
  }

  getSearchableWorkspaceFiles() {
    const rootPath = this.rootPath;
    if (!rootPath) {
      return [] as Array<{ filePath: string; relativePath: string }>;
    }

    return this.explorerEntries
      .filter((entry) => entry.kind === "file" && entry.openable)
      .map((entry) => ({
        filePath: entry.filePath,
        relativePath: path.relative(rootPath, entry.filePath)
      }));
  }

  async getDocument(filePath: string) {
    const cached = this.documentCache.get(filePath);
    if (cached) {
      return cached;
    }

    if (this.isTrackedWorkspaceFile(filePath)) {
      return this.parseDocument(filePath);
    }

    return this.parseStandaloneDocument(filePath);
  }

  async previewDocument(filePath: string, content: string) {
    const document = await this.workerPool.run<ArxmlDocumentData>({
      type: "parse",
      filePath,
      content,
      validationScope: this.getValidationScope(filePath)
    });
    document.relativePath = this.getRelativePath(document.filePath);
    return document;
  }

  getValidationScope(filePath: string): ValidationScope {
    return this.rootPath && this.isTrackedWorkspaceFile(filePath) ? this.validationScopeMode : "single-file";
  }

  updateDocument(document: ArxmlDocumentData) {
    this.documentCache.set(document.filePath, document);
    if (!this.rootPath) {
      return;
    }
    this.workspace = this.buildSnapshot(this.getIndexedDocuments());
    this.emitUpdated();
  }

  onUpdated(listener: (workspace: WorkspaceSnapshot) => void) {
    this.events.on("updated", listener);
  }

  async dispose() {
    await this.watcher?.close();
    this.watcher = undefined;
    this.events.removeAllListeners();
  }

  private buildSnapshot(documents: ArxmlDocumentData[]): WorkspaceSnapshot {
    if (!this.rootPath) {
      throw new Error("Workspace root path is not available.");
    }

    const validatedDocuments = this.semanticValidationService.validateDocuments(
      documents,
      this.validationScopeMode
    );
    enrichPortCommunicationSpecsFromEntities(validatedDocuments.flatMap((document) => document.entities));

    const files: ArxmlDocumentSummary[] = validatedDocuments
      .map((document) => ({
        filePath: document.filePath,
        relativePath: this.getRelativePath(document.filePath),
        shortName: document.shortName,
        rootTag: document.rootTag,
        validationIssues: document.validationIssues,
        validation: document.validation,
        entityCount: document.entityCount
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    return {
      rootPath: this.rootPath,
      workspaceKind: this.project?.kind ?? (this.validationScopeMode === "workspace" ? "vector-davinci" : "folder"),
      project: this.project,
      files,
      explorerEntries: this.explorerEntries,
      entities: validatedDocuments.flatMap((document) => document.entities),
      connections: validatedDocuments.flatMap((document) => document.connections),
      watched: this.workspace?.watched ?? false,
      lastIndexedAt: new Date().toISOString()
    };
  }

  private async parseDocument(filePath: string): Promise<ArxmlDocumentData> {
    const content = await fs.readFile(filePath, "utf8");
    const document = await this.workerPool.run<ArxmlDocumentData>({
      type: "parse",
      filePath,
      content,
      validationScope: this.getValidationScope(filePath)
    });
    document.relativePath = this.getRelativePath(document.filePath);
    this.documentCache.set(filePath, document);
    return document;
  }

  private async parseStandaloneDocument(filePath: string): Promise<ArxmlDocumentData> {
    const content = await fs.readFile(filePath, "utf8");
    const document = await this.workerPool.run<ArxmlDocumentData>({
      type: "parse",
      filePath,
      content,
      validationScope: "single-file"
    });
    document.relativePath = path.basename(document.filePath);
    this.documentCache.set(filePath, document);
    return document;
  }

  private getRelativePath(filePath: string) {
    if (this.rootPath && this.isTrackedWorkspaceFile(filePath)) {
      return path.relative(this.rootPath, filePath);
    }

    return path.basename(filePath);
  }

  private getIndexedDocuments() {
    return Array.from(this.documentCache.values());
  }

  private async indexVectorProjectInBackground(
    vectorProject: VectorProjectDiscovery,
    generation: number
  ) {
    const documents = await parseDocumentsConcurrently(
      vectorProject.projectInputFilePaths,
      (filePath) => this.parseDocument(filePath),
      4
    );
    if (generation !== this.workspaceGeneration || !this.rootPath) {
      return;
    }

    documents.forEach((document) => {
      this.documentCache.set(document.filePath, document);
    });
    this.project = {
      ...vectorProject.project,
      indexingStatus: "complete"
    };
    this.workspace = this.buildSnapshot(this.getIndexedDocuments());
    this.emitUpdated();
  }

  async validateDocument(filePath: string, content: string) {
    const document = await this.workerPool.run<ArxmlDocumentData>({
      type: "parse",
      filePath,
      content,
      validationScope: this.getValidationScope(filePath),
      validationEnabled: true
    });
    document.relativePath = this.getRelativePath(document.filePath);
    const indexedDocuments = [
      ...this.getIndexedDocuments().filter((cachedDocument) => cachedDocument.filePath !== filePath),
      document
    ];
    const semanticDocuments = this.semanticValidationService.validateDocuments(
      indexedDocuments,
      this.getValidationScope(filePath)
    );
    const semanticDocument = semanticDocuments.find((entry) => entry.filePath === filePath) ?? document;
    this.documentCache.set(filePath, semanticDocument);
    if (this.rootPath) {
      this.workspace = this.buildSnapshot(this.getIndexedDocuments());
      this.emitUpdated();
    }
    return semanticDocument;
  }

  closeDocument(filePath: string) {
    this.documentCache.delete(filePath);
    if (!this.rootPath) {
      return null;
    }

    this.workspace = this.buildSnapshot(this.getIndexedDocuments());
    this.emitUpdated();
    return this.workspace;
  }

  private isTrackedWorkspaceFile(filePath: string) {
    return this.explorerEntries.some((entry) => entry.kind === "file" && entry.filePath === filePath);
  }

  private async startWatching() {
    await this.watcher?.close();
    if (!this.rootPath || this.watchTargets.length === 0) {
      return;
    }

    this.watcher = chokidar.watch(this.watchTargets, {
      ignoreInitial: true
    });

    this.watcher.on("change", async (filePath) => {
      try {
        if (!this.shouldParseChangedFile(filePath)) {
          return;
        }
        const document = await this.parseDocument(filePath);
        this.updateDocument(document);
      } catch {
        return;
      }
    });

    if (this.workspace) {
      this.workspace.watched = true;
      this.emitUpdated();
    }
  }

  private emitUpdated() {
    if (this.workspace) {
      this.events.emit("updated", this.workspace);
    }
  }

  private shouldParseChangedFile(filePath: string) {
    if (this.validationScopeMode === "workspace") {
      return this.vectorProjectInputPaths.has(filePath);
    }
    return this.documentCache.has(filePath);
  }
}

async function parseDocumentsConcurrently(
  filePaths: string[],
  parse: (filePath: string) => Promise<ArxmlDocumentData>,
  concurrency: number
) {
  const documents: ArxmlDocumentData[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, filePaths.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < filePaths.length) {
        const filePath = filePaths[nextIndex];
        nextIndex += 1;
        if (!filePath) {
          continue;
        }
        const document = await parse(filePath).catch(() => undefined);
        if (document) {
          documents.push(document);
        }
      }
    })
  );

  return documents;
}

async function collectExplorerEntries(rootPath: string, currentPath = rootPath): Promise<ExplorerEntry[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const output: ExplorerEntry[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      output.push({
        name: entry.name,
        relativePath,
        filePath: fullPath,
        kind: "folder",
        openable: false
      });
      output.push(...(await collectExplorerEntries(rootPath, fullPath)));
      continue;
    }

    if (entry.isFile()) {
      output.push({
        name: entry.name,
        relativePath,
        filePath: fullPath,
        kind: "file",
        openable: entry.name.toLowerCase().endsWith(".arxml")
      });
    }
  }

  return output;
}
