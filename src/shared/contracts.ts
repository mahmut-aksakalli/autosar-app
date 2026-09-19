export type Severity = "info" | "warning" | "error";

export interface AutosarLogEntry {
  id: string;
  timestamp: string;
  severity: Severity;
  message: string;
  details?: string;
}
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

export interface EntityDetailPayload {
  fields: Array<{ label: string; value: string; valueType?: string }>;
  tables: Array<{
    title: string;
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, string>>;
  }>;
}

export interface InterfaceDetailMember {
  label: string;
  kind?: string;
  semanticPath?: string;
  metadata?: Record<string, string>;
  operationArguments?: Array<Record<string, string>>;
}

export interface PortDefinedArgumentValueDetail {
  index: string;
  name: string;
  dataType: string;
  value: string;
}

export interface CommunicationSpecDetail {
  index: string;
  dataElement: string;
  comSpec: string;
  comSpecDirection: string;
  initValue: string;
  initValueType: string;
  usesTxAcknowledge: string;
  transmissionAcknowledgeTimeout: string;
  usesEndToEndProtection: string;
  handleOutOfRange: string;
  transmissionMode: string;
  dataUpdatePeriod: string;
  minimumSendInterval: string;
  aliveTimeout: string;
  enableUpdate: string;
  handleNeverReceived: string;
  usesEndToEndProtectionErrorHandling: string;
  timeoutSubstitutionValue: string;
  timeoutSubstitutionValueType: string;
  handleTimeoutType: string;
  rxFilter: string;
  handleDataStatus: string;
  queueLength: string;
  dataType: string;
  dataConstraints: string;
  addressingMethod: string;
  useQueuedCommunication: string;
  measurementCalibration: string;
  handleInvalid: string;
}

export interface RunnableAccessPointDetail {
  target: string;
  access: string;
  name: string;
}

export interface InterRunnableVariableAccessDetail {
  runnable: string;
  access: string;
  accessPoint: string;
}

export interface RunnableActivationReasonDetail {
  bit: string;
  name: string;
  symbol: string;
}

export interface RunnableTriggerEventDetail {
  trigger: string;
  type: string;
  disabledInModes: string;
  activationReason: string;
  name: string;
}

export interface ServiceAssignedPortDetail {
  portPrototype: string;
  portPrototypeRef?: string;
  portInterface: string;
  portInterfaceRef?: string;
  assignedRole: string;
}

export interface ServiceAssignedDataDetail {
  assignedRole: string;
  value: string;
  portPrototype: string;
  portPrototypeRef?: string;
  portInterface: string;
  portInterfaceRef?: string;
  dataElementPrototype: string;
  dataElementPrototypeRef?: string;
}

export interface ServiceNeedField {
  tag: string;
  label: string;
  value: string;
}

export interface AutosarEntityDetails {
  entity?: EntityDetailPayload;
  interfaceMembers?: InterfaceDetailMember[];
  portDefinedArgumentValues?: PortDefinedArgumentValueDetail[];
  communicationSpecs?: CommunicationSpecDetail[];
}

export interface AutosarEntityReference {
  target: string;
  role: string;
  contextName?: string;
  contextPath?: string;
  contextType?: string;
}

export interface SwcInspectorItemDetails {
  accessPoints?: RunnableAccessPointDetail[];
  interRunnableVariableAccesses?: InterRunnableVariableAccessDetail[];
  activationReasons?: RunnableActivationReasonDetail[];
  triggerEvents?: RunnableTriggerEventDetail[];
  serviceNeedFields?: ServiceNeedField[];
  assignedData?: ServiceAssignedDataDetail[];
  assignedPorts?: ServiceAssignedPortDetail[];
}

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
  details?: AutosarEntityDetails;
  references?: AutosarEntityReference[];
  inspector?: SwcInspectorData;
}

export interface EntityReferenceInstance {
  id: string;
  instanceName: string;
  instanceType: string;
  referenceRole: string;
  instancePath: string;
  navigationEntityId: string;
  navigationSemanticPath?: string;
  navigationEntityType: string;
  portId?: string;
  portXmlPath?: string;
}

export type SwcInspectorSectionId =
  | "runnables"
  | "calibrationVariables"
  | "interRunnableVariables"
  | "perInstanceMemory"
  | "serviceDependencies"
  | "interfaceDataElements"
  | "interfaceOperations"
  | "interfaceApplicationErrors"
  | "interfaceParameters"
  | "interfaceModeGroups"
  | "interfaceTriggers";

export interface ModelWorkspaceTab {
  id: string;
  title: string;
  pinned?: boolean;
  kind:
    | "graph"
    | "ports"
    | "runnables"
    | "events"
    | "behavior"
    | "memory"
    | "parameters"
    | "interRunnableVariables"
    | "perInstanceMemory"
    | "exclusiveAreas"
    | "serviceDependencies"
    | "serviceDependencyGroup"
    | "port"
    | "parameter"
    | "interRunnableVariable"
    | "perInstanceMemoryItem"
    | "serviceDependency"
    | "runnable"
    | "event"
    | "entityDetails";
  focusEntityId: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  includeCompositionInternals?: boolean;
  entityId?: string;
  sectionId?: SwcInspectorSectionId;
  itemId?: string;
  serviceType?: string;
  xmlPath?: string;
}

export interface SwcInspectorItem {
  id: string;
  label: string;
  xmlPath?: string;
  metadata?: Record<string, string>;
  details?: SwcInspectorItemDetails;
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

export interface ConnectedPortReference {
  connectionId: string;
  portId?: string;
  portXmlPath?: string;
  portName: string;
  portInterface: string;
  portInterfaceRef?: string;
  ownerEntityId?: string;
  ownerSemanticPath?: string;
  swcName: string;
  swcPath: string;
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
  swcInstances: SwcInstanceReference[];
  connectedPortsByPortId: Record<string, ConnectedPortReference[]>;
  referenceInstancesByTargetId: Record<string, EntityReferenceInstance[]>;
  connections: PortConnection[];
  watched: boolean;
  lastIndexedAt: string;
}

export interface ModelWebviewInitialState {
  workspace: WorkspaceSnapshot;
  logEntries: AutosarLogEntry[];
  focusEntityId?: string;
  activeWorkspaceTab?: ModelWorkspaceTab;
}

export type HostToModelWebviewMessage =
  | { type: "focusModel"; focusEntityId?: string; activeWorkspaceTab?: ModelWorkspaceTab }
  | { type: "workspaceUpdated"; workspace: WorkspaceSnapshot }
  | { type: "logEntry"; entry: AutosarLogEntry }
  | { type: "graphResult"; requestId: string; graph: SwcGraphResult }
  | { type: "graphError"; requestId: string; message: string };

export type ModelWebviewToHostMessage =
  | { type: "buildGraph"; requestId: string; query: SwcGraphQuery }
  | { type: "revealModelEntity"; entityId: string; treeNodeId?: string }
  | { type: "copyText"; text: string };

export type SwcGraphScope = "swc" | "composition";
export type SwcGraphNodeKind = "swc" | "composition" | "instance";
export type SwcGraphEdgeKind = "assembly" | "delegation";

export interface SwcInstanceReference {
  id: string;
  instanceName: string;
  instancePath?: string;
  typeRef: string;
  swcId: string;
  swcName: string;
  parentCompositionId: string;
  parentCompositionName: string;
  parentCompositionPath?: string;
  treeNodeId: string;
}

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
  details?: AutosarEntityDetails;
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
