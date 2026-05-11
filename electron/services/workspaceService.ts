import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type {
  ArxmlDocumentData,
  ArxmlDocumentSummary,
  ExplorerEntry,
  OpenWorkspaceResult,
  WorkspaceSnapshot
} from "../../src/shared/contracts.js";
import { WorkerPool } from "./workerPool.js";

export class WorkspaceService {
  private readonly events = new EventEmitter();
  private readonly workerPool = new WorkerPool();
  private watcher?: FSWatcher;
  private rootPath?: string;
  private watchTargets: string[] = [];
  private workspace?: WorkspaceSnapshot;
  private documentCache = new Map<string, ArxmlDocumentData>();
  private explorerEntries: ExplorerEntry[] = [];

  async openWorkspace(rootPath: string): Promise<OpenWorkspaceResult> {
    this.rootPath = rootPath;
    this.documentCache.clear();
    this.explorerEntries = await collectExplorerEntries(rootPath);
    this.watchTargets = [path.join(rootPath, "**/*.arxml")];
    this.workspace = this.buildSnapshot([]);
    await this.startWatching();
    return {
      workspace: this.workspace
    };
  }

  async openFile(filePath: string): Promise<OpenWorkspaceResult> {
    this.rootPath = path.dirname(filePath);
    this.documentCache.clear();
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
      content
    });
    document.relativePath = this.getRelativePath(document.filePath);
    return document;
  }

  updateDocument(document: ArxmlDocumentData) {
    this.documentCache.set(document.filePath, document);
    if (!this.rootPath || !this.isTrackedWorkspaceFile(document.filePath)) {
      return;
    }
    this.workspace = this.buildSnapshot(this.getTrackedDocuments());
    this.emitUpdated();
  }

  onUpdated(listener: (workspace: WorkspaceSnapshot) => void) {
    this.events.on("updated", listener);
  }

  private buildSnapshot(documents: ArxmlDocumentData[]): WorkspaceSnapshot {
    if (!this.rootPath) {
      throw new Error("Workspace root path is not available.");
    }

    const files: ArxmlDocumentSummary[] = documents
      .map((document) => ({
        filePath: document.filePath,
        relativePath: path.relative(this.rootPath!, document.filePath),
        shortName: document.shortName,
        rootTag: document.rootTag,
        validationIssues: document.validationIssues,
        entityCount: document.entityCount
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    return {
      rootPath: this.rootPath,
      files,
      explorerEntries: this.explorerEntries,
      entities: documents.flatMap((document) => document.entities),
      connections: documents.flatMap((document) => document.connections),
      watched: this.workspace?.watched ?? false,
      lastIndexedAt: new Date().toISOString()
    };
  }

  private async parseDocument(filePath: string): Promise<ArxmlDocumentData> {
    const content = await fs.readFile(filePath, "utf8");
    const document = await this.workerPool.run<ArxmlDocumentData>({
      type: "parse",
      filePath,
      content
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
      content
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

  private getTrackedDocuments() {
    return Array.from(this.documentCache.values()).filter((document) =>
      this.isTrackedWorkspaceFile(document.filePath)
    );
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
