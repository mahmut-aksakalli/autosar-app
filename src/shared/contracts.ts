export type Severity = "info" | "warning" | "error";
export type ValidationIssueCategory = "syntax" | "namespace" | "schema" | "serialization" | "semantic";
export type ValidationScope = "single-file" | "workspace" | "batch";
export type ValidationCompleteness = "complete" | "partial" | "not-validated";
export type ReferenceResolutionStatus =
  | "resolved-local"
  | "resolved-workspace"
  | "external"
  | "unresolved"
  | "wrong-kind"
  | "ambiguous";
export type SwcKind =
  | "application"
  | "composition"
  | "parameter"
  | "sensor-actuator"
  | "ecu-abstraction"
  | "complex-device-driver"
  | "service"
  | "service-proxy"
  | "nv-block"
  | "generic";
export type PortKind = "provided" | "required" | "provided-required";
export type PortDirection = "provided" | "required" | "provided-required";
export type PortInterfaceKind =
  | "sender-receiver"
  | "client-server"
  | "mode-switch"
  | "nv-data"
  | "parameter"
  | "trigger"
  | "unknown";

export interface ValidationIssue {
  severity: Severity;
  message: string;
  path?: string;
  category?: ValidationIssueCategory;
  code?: string;
  line?: number;
  column?: number;
  filePath?: string;
  source?: "xml-parser" | "namespace" | "xsd" | "serialization" | "autosar-model";
  schemaFile?: string;
  semanticPath?: string;
  relatedTargetPath?: string;
  referenceValue?: string;
  expectedDestination?: string;
  referenceStatus?: ReferenceResolutionStatus;
  validationScope?: ValidationScope;
}

export interface ArxmlValidationMetadata {
  scope: ValidationScope;
  completeness: ValidationCompleteness;
  rootTag?: string;
  namespace?: string;
  schemaLocation?: string;
  autosarRelease?: string;
  autosarVersion?: string;
  schemaFile?: string;
  validatedAt: string;
}

export interface AutosarEntity {
  id: string;
  type: string;
  shortName: string;
  path: string;
  filePath: string;
  xmlPath?: string;
  semanticPath?: string;
  parentSemanticPath?: string;
  rawTagName?: string;
  packagePath?: string;
  shortNamePath?: string[];
  semanticKind?: string;
  autosarRelease?: string;
  autosarVersion?: string;
  extractionProfile?: string;
  extractionAdapterId?: string;
  modelCompleteness?: "complete" | "partial" | "external-context";
  validationScope?: ValidationScope;
  swcKind?: SwcKind;
  portKind?: PortKind;
  portDirection?: PortDirection;
  mayBeUnconnected?: boolean;
  typeRef?: string;
  interfaceKind?: PortInterfaceKind;
  metadata?: Record<string, string>;
  inspector?: SwcInspectorData;
}

export type SwcInspectorSectionId =
  | "runnables"
  | "calibrationVariables"
  | "interRunnableVariables"
  | "perInstanceMemory"
  | "interfaceDataElements"
  | "interfaceOperations"
  | "interfaceApplicationErrors"
  | "interfaceParameters"
  | "interfaceModeGroups"
  | "interfaceTriggers";

export interface SwcInspectorItem {
  id: string;
  label: string;
  xmlPath?: string;
  metadata?: Record<string, string>;
}

export interface SwcInspectorSection {
  id: SwcInspectorSectionId;
  label: string;
  items: SwcInspectorItem[];
}

export interface SwcInspectorData {
  ownerId?: string;
  ownerLabel: string;
  ownerSemanticPath?: string;
  sections: SwcInspectorSection[];
}

export interface PortConnection {
  id: string;
  from: string;
  to: string;
  label: string;
  filePath: string;
  kind?: "assembly" | "delegation";
  xmlPath?: string;
  providerComponentRef?: string;
  requesterComponentRef?: string;
  sourcePortRef?: string;
  targetPortRef?: string;
  outerPortRef?: string;
  unresolved?: boolean;
}

export interface StructuredField {
  key: string;
  value: string;
  category: string;
  xmlPath?: string;
  editable?: boolean;
}

export interface ArxmlDocumentSummary {
  filePath: string;
  relativePath: string;
  shortName: string;
  rootTag: string;
  validationIssues: ValidationIssue[];
  validation: ArxmlValidationMetadata;
  entityCount: number;
}

export interface ArxmlDocumentData extends ArxmlDocumentSummary {
  content: string;
  structuredFields: StructuredField[];
  entities: AutosarEntity[];
  connections: PortConnection[];
}

export interface ExplorerEntry {
  name: string;
  relativePath: string;
  filePath: string;
  kind: "folder" | "file";
  openable: boolean;
}

export type WorkspaceKind = "single-file" | "folder" | "vector-davinci";

export interface VectorProjectMetadataFile {
  filePath: string;
  relativePath: string;
  kind: "dpa" | "dcf" | "dvgproj" | "vector-metadata";
}

export interface WorkspaceProjectInfo {
  kind: WorkspaceKind;
  displayName: string;
  metadataFiles: VectorProjectMetadataFile[];
  inputFiles: Array<{
    filePath: string;
    relativePath: string;
    sourceMetadataPath?: string;
  }>;
  indexedInBackground: boolean;
  indexingStatus?: "idle" | "loading" | "complete";
}

export interface WorkspaceSnapshot {
  rootPath: string;
  workspaceKind?: WorkspaceKind;
  project?: WorkspaceProjectInfo;
  files: ArxmlDocumentSummary[];
  explorerEntries: ExplorerEntry[];
  entities: AutosarEntity[];
  connections: PortConnection[];
  watched: boolean;
  lastIndexedAt: string;
}

export type SwcGraphScope = "swc" | "composition";
export type SwcGraphNodeKind = "swc" | "composition" | "instance" | "port";
export type SwcGraphEdgeKind = "assembly" | "delegation";

export interface SwcGraphPort {
  id: string;
  label: string;
  semanticPath?: string;
  xmlPath?: string;
  direction: PortDirection;
  portKind?: PortKind;
  interfaceRef?: string;
  interfaceKind?: PortInterfaceKind;
  ownerId: string;
  ownerSemanticPath?: string;
  filePath: string;
  warning?: string;
  metadata?: Record<string, string>;
}

export interface SwcGraphNode {
  id: string;
  kind: SwcGraphNodeKind;
  label: string;
  semanticPath?: string;
  xmlPath?: string;
  filePath: string;
  parentId?: string;
  swcKind?: SwcKind;
  typeRef?: string;
  warning?: string;
  metadata?: Record<string, string>;
  inspector?: SwcInspectorData;
  ports: SwcGraphPort[];
}

export interface SwcGraphEdge {
  id: string;
  kind: SwcGraphEdgeKind;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label: string;
  filePath: string;
  xmlPath?: string;
  warning?: string;
}

export interface SwcGraphResult {
  focusId?: string;
  scope: SwcGraphScope;
  nodes: SwcGraphNode[];
  edges: SwcGraphEdge[];
  warnings: ValidationIssue[];
}

export interface SwcGraphQuery {
  scope: SwcGraphScope;
  focusId?: string;
  depth: number;
  includeCompositionInternals?: boolean;
}

export interface SearchInputDocument {
  filePath: string;
  relativePath: string;
  content: string;
}

export interface SearchMatch {
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchLength: number;
}

export interface FileSearchResult {
  filePath: string;
  relativePath: string;
  matches: SearchMatch[];
}

export interface OpenWorkspaceResult {
  workspace: WorkspaceSnapshot;
  firstFile?: ArxmlDocumentData;
}

export interface OpenArxmlFileResult {
  document?: ArxmlDocumentData;
  firstFile?: ArxmlDocumentData;
  workspace?: WorkspaceSnapshot;
}

export interface AutosarApi {
  openWorkspace(): Promise<OpenWorkspaceResult | null>;
  openArxmlFile(): Promise<OpenArxmlFileResult | null>;
  openWorkspacePath(rootPath: string): Promise<OpenWorkspaceResult | null>;
  openArxmlFilePath(filePath: string): Promise<OpenArxmlFileResult | null>;
  getWorkspaceState(): Promise<WorkspaceSnapshot | null>;
  openDocument(filePath: string): Promise<ArxmlDocumentData>;
  previewDocument(filePath: string, content: string): Promise<ArxmlDocumentData>;
  saveDocument(filePath: string, content: string): Promise<ArxmlDocumentData>;
  closeDocument(filePath: string): Promise<WorkspaceSnapshot | null>;
  validateDocument(filePath: string, content: string): Promise<ArxmlDocumentData>;
  buildGraph(query: SwcGraphQuery): Promise<SwcGraphResult>;
  searchFiles(query: string, openDocuments: SearchInputDocument[]): Promise<FileSearchResult[]>;
  onWorkspaceUpdated(listener: (workspace: WorkspaceSnapshot) => void): () => void;
  onToggleBottomPanel(listener: () => void): () => void;
}
