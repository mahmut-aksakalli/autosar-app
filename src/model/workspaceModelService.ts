import * as path from "node:path";
import { EventEmitter } from "node:events";
import * as vscode from "vscode";
import { XMLParser } from "fast-xml-parser";
import type {
  ArxmlDocumentData,
  ArxmlDocumentSummary,
  ArxmlValidationMetadata,
  ExplorerEntry,
  ValidationScope,
  WorkspaceProjectInfo,
  WorkspaceSnapshot
} from "../shared/contracts";
import { noopAutosarLogger, type AutosarLogger } from "../logging/AutosarLogger";
import { buildSwcInstanceReferences } from "./swcInstanceService";
import { buildConnectedPortsByPortId } from "./portConnectionService";
import { buildReferenceInstancesByTargetId } from "./entityReferenceService";
import { buildAutosarModel, enrichPortCommunicationSpecsFromEntities } from "./autosarModel";
import { AutosarSemanticValidationService } from "./autosarSemanticValidationService";
import { discoverVectorProject } from "./vectorProjectService";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  allowBooleanAttributes: true
});

const vectorMetadataPattern = "**/*.{dpa,dcf,dvgproj,dvgproject,dvcfg}";
const arxmlPattern = "**/*.arxml";
const modelInputPattern = "**/*.{arxml,dpa,dcf,dvgproj,dvgproject,dvcfg}";

export class WorkspaceModelService implements vscode.Disposable {
  private readonly events = new EventEmitter();
  private readonly semanticValidationService = new AutosarSemanticValidationService();
  private readonly disposables: vscode.Disposable[] = [];
  private workspace?: WorkspaceSnapshot;
  private workspaceFolder?: vscode.WorkspaceFolder;
  private singleFilePath?: string;
  private indexingGeneration = 0;
  private workspaceIndexPromise?: Promise<WorkspaceSnapshot | null>;

  constructor(private readonly logger: AutosarLogger = noopAutosarLogger) {
    const watcher = vscode.workspace.createFileSystemWatcher(modelInputPattern);
    this.disposables.push(
      watcher,
      watcher.onDidCreate(() => void this.refresh()),
      watcher.onDidChange(() => void this.refresh()),
      watcher.onDidDelete(() => void this.refresh())
    );
  }

  getSnapshot() {
    return this.workspace ?? null;
  }

  onUpdated(listener: (workspace: WorkspaceSnapshot) => void) {
    this.events.on("updated", listener);
    return {
      dispose: () => this.events.off("updated", listener)
    };
  }

  onIndexingChanged(listener: (indexing: boolean) => void) {
    this.events.on("indexingChanged", listener);
    return {
      dispose: () => this.events.off("indexingChanged", listener)
    };
  }

  /**
   * Returns the current workspace model when it is already available. If an
   * index is running, every caller waits for that same operation instead of
   * starting another parse of the workspace.
   */
  async ensureWorkspaceIndexed() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return this.refresh();
    }

    const hasCurrentWorkspace =
      this.workspace !== undefined &&
      this.singleFilePath === undefined &&
      this.workspaceFolder?.uri.toString() === workspaceFolder.uri.toString();

    if (hasCurrentWorkspace) {
      return this.workspace ?? null;
    }

    return this.refresh();
  }

  refresh(): Promise<WorkspaceSnapshot | null> {
    if (this.workspaceIndexPromise) {
      return this.workspaceIndexPromise;
    }

    const indexPromise = this.indexWorkspaceFolder();
    this.workspaceIndexPromise = indexPromise;

    const clearCompletedIndex = () => {
      if (this.workspaceIndexPromise === indexPromise) {
        this.workspaceIndexPromise = undefined;
      }
    };
    void indexPromise.then(clearCompletedIndex, clearCompletedIndex);

    return indexPromise;
  }

  private async indexWorkspaceFolder() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.workspaceFolder = undefined;
      this.workspace = undefined;
      this.logger.warning("Workspace indexing skipped because no VS Code workspace folder is open.");
      return null;
    }

    this.singleFilePath = undefined;
    this.workspaceFolder = workspaceFolder;
    const generation = ++this.indexingGeneration;

    this.setIndexing(true);
    try {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "Indexing AUTOSAR model"
        },
        async () => {
          const snapshot = await this.indexWorkspace(workspaceFolder, generation);
          if (snapshot && generation === this.indexingGeneration) {
            this.workspace = snapshot;
            this.events.emit("updated", snapshot);
            this.logger.info(
              `Workspace indexing complete: ${snapshot.files.length} ARXML file(s), ${snapshot.entities.length} model entity/entities.`
            );
          }
          return snapshot;
        }
      );
    } finally {
      if (generation === this.indexingGeneration) {
        this.setIndexing(false);
      }
    }
  }

  async openFile(uri?: vscode.Uri) {
    const selectedUri = uri ?? (await pickArxmlFile());
    if (!selectedUri) {
      return null;
    }

    const generation = ++this.indexingGeneration;
    this.setIndexing(true);
    try {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "Indexing AUTOSAR file"
        },
        async () => {
          const snapshot = await this.indexSingleFile(selectedUri.fsPath, generation);
          if (snapshot && generation === this.indexingGeneration) {
            this.workspaceFolder = undefined;
            this.singleFilePath = selectedUri.fsPath;
            this.workspace = snapshot;
            this.events.emit("updated", snapshot);
            this.logger.info(
              `Single-file indexing complete: ${snapshot.files.length} ARXML file(s), ${snapshot.entities.length} model entity/entities.`
            );
          }
          return snapshot;
        }
      );
    } finally {
      if (generation === this.indexingGeneration) {
        this.setIndexing(false);
      }
    }
  }

  dispose() {
    this.disposables.forEach((disposable) => disposable.dispose());
    this.events.removeAllListeners();
  }

  async refreshCurrent() {
    if (this.singleFilePath) {
      return this.openFile(vscode.Uri.file(this.singleFilePath));
    }
    return this.refresh();
  }

  private async indexWorkspace(workspaceFolder: vscode.WorkspaceFolder, generation: number) {
    const rootPath = workspaceFolder.uri.fsPath;
    this.logger.info(`Indexing AUTOSAR workspace: ${rootPath}`);
    const metadataEntries = await collectModelExplorerEntries(workspaceFolder, vectorMetadataPattern);
    let discoveredArxmlEntries: ExplorerEntry[] | undefined;
    const findAllArxmlEntries = async () => {
      if (!discoveredArxmlEntries) {
        discoveredArxmlEntries = await collectModelExplorerEntries(workspaceFolder, arxmlPattern);
      }
      return discoveredArxmlEntries;
    };
    const vectorProject = await discoverVectorProject(rootPath, metadataEntries, findAllArxmlEntries);
    if (vectorProject) {
      this.logger.info(
        `Detected Vector DaVinci project metadata: ${vectorProject.project.metadataFiles
          .map((file) => file.relativePath)
          .join(", ")}`
      );
    } else {
      this.logger.info("No Vector DaVinci project metadata found; scanning workspace ARXML files.");
    }

    const arxmlEntries = vectorProject
      ? vectorProject.project.inputFiles.map((input): ExplorerEntry => ({
          name: path.basename(input.filePath),
          relativePath: input.relativePath,
          filePath: input.filePath,
          kind: "file",
          openable: true
        }))
      : await findAllArxmlEntries();
    const explorerEntries = [...metadataEntries, ...arxmlEntries].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    );
    if (vectorProject) {
      this.logger.info(`Resolved ${arxmlEntries.length} ARXML input(s) from the selected Vector project.`);
    } else {
      this.logger.info(`Discovered ${arxmlEntries.length} ARXML file(s) in workspace.`);
    }
    const project: WorkspaceProjectInfo = vectorProject?.project ?? {
      kind: "folder",
      displayName: workspaceFolder.name,
      metadataFiles: [],
      inputFiles: arxmlEntries.map((entry) => ({
        filePath: entry.filePath,
        relativePath: entry.relativePath
      })),
      indexedInBackground: false,
      indexingStatus: "idle"
    };
    const validationScope: ValidationScope = vectorProject ? "workspace" : "workspace";
    const inputPaths = vectorProject?.projectInputFilePaths ?? arxmlEntries.map((entry) => entry.filePath);
    const documents: ArxmlDocumentData[] = [];

    if (inputPaths.length === 0) {
      if (vectorProject) {
        this.logger.warning(`No ARXML inputs resolved for Vector project: ${vectorProject.project.displayName}.`);
      } else {
        this.logger.warning(`No ARXML files found in workspace: ${rootPath}`);
      }
    } else {
      this.logger.info(`Parsing ${inputPaths.length} ARXML file(s) during workspace loading.`);
    }

    for (const filePath of inputPaths) {
      if (generation !== this.indexingGeneration) {
        this.logger.warning("Workspace indexing was superseded by a newer indexing request.");
        return null;
      }
      const document = await parseModelDocument(rootPath, filePath, validationScope, this.logger);
      if (document) {
        documents.push(document);
      }
    }

    const validatedDocuments = this.semanticValidationService.validateDocuments(documents, validationScope);
    enrichPortCommunicationSpecsFromEntities(validatedDocuments.flatMap((document) => document.entities));

    const files: ArxmlDocumentSummary[] = validatedDocuments
      .map((document) => ({
        filePath: document.filePath,
        relativePath: document.relativePath,
        shortName: document.shortName,
        rootTag: document.rootTag,
        validationIssues: document.validationIssues,
        validation: document.validation,
        entityCount: document.entityCount
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    const entities = validatedDocuments.flatMap((document) => document.entities);
    const connections = validatedDocuments.flatMap((document) => document.connections);
    return {
      rootPath,
      workspaceKind: project.kind,
      project: vectorProject
        ? {
            ...project,
            indexingStatus: "complete" as const
          }
        : project,
      files,
      explorerEntries,
      entities,
      swcInstances: buildSwcInstanceReferences(entities),
      connectedPortsByPortId: buildConnectedPortsByPortId(entities, connections),
      referenceInstancesByTargetId: buildReferenceInstancesByTargetId(entities),
      connections,
      watched: true,
      lastIndexedAt: new Date().toISOString()
    } satisfies WorkspaceSnapshot;
  }

  private setIndexing(indexing: boolean) {
    this.events.emit("indexingChanged", indexing);
  }

  private async indexSingleFile(filePath: string, generation: number) {
    if (generation !== this.indexingGeneration) {
      this.logger.warning("Single-file indexing was superseded by a newer indexing request.");
      return null;
    }

    const rootPath = path.dirname(filePath);
    this.logger.info(`Indexing AUTOSAR file: ${filePath}`);
    const document = await parseModelDocument(rootPath, filePath, "single-file", this.logger);
    if (!document) {
      return null;
    }

    const validatedDocuments = this.semanticValidationService.validateDocuments([document], "single-file");
    enrichPortCommunicationSpecsFromEntities(validatedDocuments.flatMap((entry) => entry.entities));
    const validatedDocument = validatedDocuments[0] ?? document;
    const project: WorkspaceProjectInfo = {
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

    const entities = validatedDocument.entities;
    return {
      rootPath,
      workspaceKind: "single-file",
      project,
      files: [
        {
          filePath: validatedDocument.filePath,
          relativePath: validatedDocument.relativePath,
          shortName: validatedDocument.shortName,
          rootTag: validatedDocument.rootTag,
          validationIssues: validatedDocument.validationIssues,
          validation: validatedDocument.validation,
          entityCount: validatedDocument.entityCount
        }
      ],
      explorerEntries: [
        {
          name: path.basename(filePath),
          relativePath: path.basename(filePath),
          filePath,
          kind: "file",
          openable: true
        }
      ],
      entities,
      swcInstances: buildSwcInstanceReferences(entities),
      connectedPortsByPortId: buildConnectedPortsByPortId(entities, validatedDocument.connections),
      referenceInstancesByTargetId: buildReferenceInstancesByTargetId(entities),
      connections: validatedDocument.connections,
      watched: true,
      lastIndexedAt: new Date().toISOString()
    } satisfies WorkspaceSnapshot;
  }
}

async function collectModelExplorerEntries(
  workspaceFolder: vscode.WorkspaceFolder,
  pattern: string
): Promise<ExplorerEntry[]> {
  const rootPath = workspaceFolder.uri.fsPath;
  const uris = await vscode.workspace.findFiles(pattern, "**/{node_modules,.git,dist,out}/**");
  return uris
    .filter((uri) => isInsideWorkspace(rootPath, uri.fsPath))
    .map((uri) => ({
      name: path.basename(uri.fsPath),
      relativePath: path.relative(rootPath, uri.fsPath),
      filePath: uri.fsPath,
      kind: "file" as const,
      openable: uri.fsPath.toLowerCase().endsWith(".arxml")
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function parseModelDocument(
  rootPath: string,
  filePath: string,
  validationScope: ValidationScope,
  logger: AutosarLogger = noopAutosarLogger
) {
  try {
    const contentBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const content = Buffer.from(contentBytes).toString("utf8");
    const parsed = parser.parse(content);
    const validation = createNotValidatedMetadata(validationScope);
    const model = buildAutosarModel(filePath, parsed, {
      validation,
      validationScope
    });
    logger.info(
      `    ${path.relative(rootPath, filePath)} (${model.entities.length} model entity, ${model.connections.length} connection(s)).`
    );

    return {
      filePath,
      content,
      relativePath: path.relative(rootPath, filePath),
      rootTag: model.rootTag,
      shortName: model.shortName,
      entities: model.entities,
      connections: model.connections,
      structuredFields: [],
      validationIssues: model.validationIssues,
      validation,
      entityCount: model.entities.length
    } satisfies ArxmlDocumentData;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validation = createNotValidatedMetadata(validationScope);
    logger.error(`Failed to parse ARXML: ${path.relative(rootPath, filePath)}.`, error);
    return {
      filePath,
      content: "",
      relativePath: path.relative(rootPath, filePath),
      rootTag: "UNKNOWN",
      shortName: path.basename(filePath),
      entities: [],
      connections: [],
      structuredFields: [],
      validationIssues: [
        {
          severity: "error",
          category: "syntax",
          source: "xml-parser",
          message,
          filePath
        }
      ],
      validation,
      entityCount: 0
    } satisfies ArxmlDocumentData;
  }
}

function createNotValidatedMetadata(scope: ValidationScope): ArxmlValidationMetadata {
  return {
    scope,
    completeness: "not-validated",
    rootTag: "AUTOSAR",
    validatedAt: new Date().toISOString()
  };
}

function isInsideWorkspace(rootPath: string, filePath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function pickArxmlFile() {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      "AUTOSAR XML": ["arxml"]
    },
    title: "Open AUTOSAR ARXML File"
  });
  return selection?.[0];
}
