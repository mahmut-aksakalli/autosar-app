import path from "node:path";
import type {
  AutosarEntity,
  PortDirection,
  PortInterfaceKind,
  PortKind,
  PortConnection,
  SwcKind,
  StructuredField,
  SwcInspectorData,
  SwcInspectorItem,
  SwcInspectorSectionId,
  ValidationScope,
  ValidationIssue
} from "../shared/contracts";
import {
  createAutosarVersionAdapter,
  type AutosarEntityType,
  type AutosarVersionAdapter
} from "./autosarVersionAdapters";
import type { ArxmlValidationMetadata } from "../shared/contracts";

const PORT_TAGS = new Set(["P-PORT-PROTOTYPE", "R-PORT-PROTOTYPE", "PR-PORT-PROTOTYPE"]);
const CONNECTION_TAGS = new Set(["ASSEMBLY-SW-CONNECTOR", "DELEGATION-SW-CONNECTOR"]);
const SWC_TAG_SUFFIX = "-SW-COMPONENT-TYPE";
const INSTANCE_TAG = "SW-COMPONENT-PROTOTYPE";
const INTERFACE_TAGS = new Set([
  "SENDER-RECEIVER-INTERFACE",
  "CLIENT-SERVER-INTERFACE",
  "MODE-SWITCH-INTERFACE",
  "NV-DATA-INTERFACE",
  "PARAMETER-INTERFACE",
  "TRIGGER-INTERFACE"
]);
const APPLICATION_DATA_TYPE_TAGS = new Set([
  "APPLICATION-ARRAY-DATA-TYPE",
  "APPLICATION-ASSOC-MAP-DATA-TYPE",
  "APPLICATION-COMPOSITE-DATA-TYPE",
  "APPLICATION-PRIMITIVE-DATA-TYPE",
  "APPLICATION-RECORD-DATA-TYPE"
]);

type EntityType = AutosarEntityType;

export interface ParsedAutosarModel {
  rootTag: string;
  shortName: string;
  entities: AutosarEntity[];
  connections: PortConnection[];
  structuredFields: StructuredField[];
  validationIssues: ValidationIssue[];
}

interface WalkState {
  filePath: string;
  validationScope: ValidationScope;
  adapter: AutosarVersionAdapter;
  tagName: string;
  node: unknown;
  currentPath: string;
  semanticSegments: string[];
  currentOwnerSemanticPath?: string;
  currentInterfaceSemanticPath?: string;
  entities: AutosarEntity[];
  connections: PortConnection[];
  structuredFields: StructuredField[];
  validationIssues: ValidationIssue[];
  inspectorsByOwner: Map<string, MutableSwcInspector>;
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>;
  constantValueSpecsByPath: Map<string, unknown>;
}

interface MutableSwcInspector {
  ownerSemanticPath: string;
  sections: Record<SwcInspectorSectionId, SwcInspectorItem[]>;
  runnablePeriodsByName: Record<string, string>;
  runnableEventsByName: Record<string, string[]>;
  runnableEventDetailsByName: Record<string, RunnableTriggerEventDetail[]>;
  runnableAccessPointDetailsByName: Record<string, RunnableAccessPointDetail[]>;
  nvmBlockNeedsByPimName: Record<string, string>;
  portInterfacesByName: Record<string, string>;
  portApiOptionsByPortRef: Record<string, Record<string, string>>;
}

interface InterfaceDefinition {
  semanticPath: string;
  kind: PortInterfaceKind;
  dataElements: InterfaceMember[];
  operations: InterfaceMember[];
  applicationErrors: InterfaceMember[];
  parameters: InterfaceMember[];
  modeGroups: InterfaceMember[];
  triggers: InterfaceMember[];
}

interface InterfaceMember {
  id: string;
  label: string;
  kind: string;
  xmlPath: string;
  semanticPath?: string;
  metadata?: Record<string, string>;
}

interface SerializedInterfaceMember {
  label: string;
  kind?: string;
  semanticPath?: string;
  metadata?: Record<string, string>;
}

interface RunnableTriggerEventDetail {
  trigger: string;
  type: string;
  disabledInModes: string;
  activationReason: string;
  name: string;
}

export function buildAutosarModel(
  filePath: string,
  parsedXml: unknown,
  options: { validation?: ArxmlValidationMetadata; validationScope?: ValidationScope } = {}
): ParsedAutosarModel {
  const entries = Object.entries((parsedXml as Record<string, unknown>) ?? {}).filter(
    ([key]) => !key.startsWith("?")
  );
  const [rootTag, rootNode] = entries[0] ?? ["UNKNOWN", {}];
  const validationScope = options.validationScope ?? options.validation?.scope ?? "single-file";
  const adapter = createAutosarVersionAdapter({
    rootNode,
    validation: options.validation,
    validationScope
  });
  const entities: AutosarEntity[] = [];
  const connections: PortConnection[] = [];
  const structuredFields: StructuredField[] = [];
  const validationIssues: ValidationIssue[] = [];
  const inspectorsByOwner = new Map<string, MutableSwcInspector>();
  const interfaceDefinitionsByPath = new Map<string, InterfaceDefinition>();
  const constantValueSpecsByPath = new Map<string, unknown>();

  const shortName = findFirstShortName(rootNode) ?? path.basename(filePath);
  structuredFields.push(
    { key: "SHORT-NAME", value: shortName, category: "Document", editable: false },
    { key: "ROOT-TAG", value: rootTag, category: "Document", editable: false }
  );

  walkNode({
    filePath,
    validationScope,
    adapter,
    tagName: rootTag,
    node: rootNode,
    currentPath: `/${rootTag}`,
    semanticSegments: [],
    entities,
    connections,
    structuredFields,
    validationIssues,
    inspectorsByOwner,
    interfaceDefinitionsByPath,
    constantValueSpecsByPath
  });

  resolvePortComSpecValueReferences(entities, constantValueSpecsByPath);
  attachInterfaceDefinitionMetadataToEntities(entities, interfaceDefinitionsByPath);
  enrichPortInterfaceMetadataFromEntities(entities);
  attachInspectorsToEntities(entities, inspectorsByOwner, interfaceDefinitionsByPath, validationIssues);

  if (entities.length === 0) {
    validationIssues.push({
      severity: "warning",
      message: "No AUTOSAR entities were discovered in this file.",
      path: `/${rootTag}`
    });
  }

  return {
    rootTag,
    shortName,
    entities,
    connections,
    structuredFields,
    validationIssues
  };
}

function walkNode(state: WalkState) {
  const {
    filePath,
    validationScope,
    adapter,
    tagName,
    node,
    currentPath,
    semanticSegments,
    currentOwnerSemanticPath,
    currentInterfaceSemanticPath,
    entities,
    connections,
    structuredFields,
    validationIssues,
    inspectorsByOwner,
    interfaceDefinitionsByPath,
    constantValueSpecsByPath
  } = state;

  if (Array.isArray(node)) {
    node.forEach((entry, index) =>
      walkNode({
        ...state,
        node: entry,
        currentPath: `${currentPath}[${index}]`
      })
    );
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  const shortName = extractShortName(record);
  const type = adapter.classifyTag(tagName);
  const fieldCategory = type === "generic" ? tagName : type;
  const nextSemanticSegments = shortName ? [...semanticSegments, shortName] : semanticSegments;
  const semanticPath = shortName ? `/${nextSemanticSegments.join("/")}` : undefined;
  const ownerSemanticPath = resolveOwnerSemanticPath(type, semanticPath, currentOwnerSemanticPath);
  const swcKind = type === "swc" || type === "composition" ? adapter.getSwcKind(tagName) : undefined;
  const portKind = type === "port" ? adapter.getPortKind(tagName) : undefined;
  const interfaceKind =
    type === "interface"
      ? adapter.getInterfaceKind(tagName)
      : type === "port"
        ? extractPortInterfaceKind(record)
        : undefined;
  const currentInterfacePath = type === "interface" ? semanticPath : currentInterfaceSemanticPath;
  const nextInterfacePath = currentInterfacePath ?? currentInterfaceSemanticPath;

  if (shortName && type !== "generic") {
    entities.push({
      id: `${filePath}:${currentPath}`,
      type,
      shortName,
      path: semanticPath ?? currentPath,
      filePath,
      xmlPath: currentPath,
      semanticPath,
      parentSemanticPath:
        semanticSegments.length > 0 ? `/${semanticSegments.join("/")}` : undefined,
      rawTagName: tagName,
      packagePath: semanticSegments.length > 0 ? `/${semanticSegments.join("/")}` : undefined,
      shortNamePath: nextSemanticSegments,
      semanticKind: type,
      autosarRelease: adapter.context.autosarRelease,
      autosarVersion: adapter.context.autosarVersion,
      extractionProfile: adapter.context.profile,
      extractionAdapterId: adapter.context.adapterId,
      modelCompleteness: adapter.context.modelCompleteness,
      validationScope,
      swcKind,
      portKind,
      portDirection: adapter.getPortDirection(tagName),
      mayBeUnconnected: readBooleanValue(record["MAY-BE-UNCONNECTED"]),
      typeRef: adapter.extractTypeRef(record),
      interfaceKind,
      metadata:
        type === "port"
          ? collectPortMetadata(record)
          : type === "constant"
            ? collectConstantMetadata(record)
            : collectEntityMetadata(type, tagName, record)
    });
  }

  if (type === "interface" && semanticPath) {
    interfaceDefinitionsByPath.set(semanticPath, {
      semanticPath,
      kind: interfaceKind ?? "unknown",
      dataElements: [],
      operations: [],
      applicationErrors: [],
      parameters: [],
      modeGroups: [],
      triggers: []
    });
  }
  if (tagName === "CONSTANT-SPECIFICATION" && semanticPath) {
    constantValueSpecsByPath.set(semanticPath, record["VALUE-SPEC"]);
  }

  collectStructuredFields(record, currentPath, fieldCategory, structuredFields);
  collectSwcInspectorFeature(tagName, record, currentPath, currentOwnerSemanticPath, inspectorsByOwner);
  collectInterfaceDefinitionFeature(tagName, record, currentPath, nextInterfacePath, interfaceDefinitionsByPath);

  if (PORT_TAGS.has(tagName) && !shortName) {
    validationIssues.push({
      severity: "warning",
      message: `${tagName} is missing SHORT-NAME.`,
      path: currentPath
    });
  }
  if (PORT_TAGS.has(tagName) && !adapter.extractTypeRef(record)) {
    validationIssues.push({
      severity: "warning",
      message: `${shortName ?? tagName} does not reference a PortInterface.`,
      path: currentPath
    });
  }
  if (tagName === "PR-PORT-PROTOTYPE" && !extractReference(record, "PROVIDED-REQUIRED-INTERFACE-TREF")) {
    validationIssues.push({
      severity: "warning",
      message: `${shortName ?? tagName} is a PR port without PROVIDED-REQUIRED-INTERFACE-TREF.`,
      path: currentPath
    });
  }

  if (CONNECTION_TAGS.has(tagName)) {
    connections.push(buildConnectionRecord(filePath, currentPath, tagName, record, shortName));
  }

  const nextOwnerSemanticPath =
    type === "swc" || type === "composition"
      ? semanticPath
      : type === "instance" || type === "port"
        ? ownerSemanticPath
        : currentOwnerSemanticPath;

  for (const [childTag, childValue] of Object.entries(record)) {
    if (childTag.startsWith("@_")) {
      continue;
    }

    walkNode({
      filePath,
      validationScope,
      adapter,
      tagName: childTag,
      node: childValue,
      currentPath: `${currentPath}/${childTag}`,
      semanticSegments: nextSemanticSegments,
      currentOwnerSemanticPath: nextOwnerSemanticPath,
      currentInterfaceSemanticPath: nextInterfacePath,
      entities,
      connections,
      structuredFields,
      validationIssues,
      inspectorsByOwner,
      interfaceDefinitionsByPath,
      constantValueSpecsByPath
    });
  }
}

function classifyTag(tagName: string): EntityType {
  if (tagName === INSTANCE_TAG) {
    return "instance";
  }
  if (tagName === "COMPOSITION-SW-COMPONENT-TYPE") {
    return "composition";
  }
  if (tagName.endsWith(SWC_TAG_SUFFIX)) {
    return "swc";
  }
  if (PORT_TAGS.has(tagName)) {
    return "port";
  }
  if (CONNECTION_TAGS.has(tagName)) {
    return "connection";
  }
  if (INTERFACE_TAGS.has(tagName)) {
    return "interface";
  }
  if (tagName === "CONSTANT-SPECIFICATION") {
    return "constant";
  }
  if (APPLICATION_DATA_TYPE_TAGS.has(tagName)) {
    return "application-data-type";
  }
  if (tagName === "IMPLEMENTATION-DATA-TYPE") {
    return "implementation-data-type";
  }
  if (tagName === "SW-BASE-TYPE") {
    return "base-type";
  }
  if (tagName === "UNIT") {
    return "unit";
  }
  if (tagName === "COMPU-METHOD") {
    return "compu-method";
  }
  if (tagName === "DATA-CONSTR") {
    return "data-constraint";
  }
  if (tagName === "SW-RECORD-LAYOUT") {
    return "record-layout";
  }
  if (tagName === "MODE-DECLARATION-GROUP") {
    return "mode-declaration-group";
  }
  if (tagName === "DATA-TYPE-MAPPING-SET") {
    return "type-mapping-set";
  }
  if (tagName === "SW-ADDR-METHOD") {
    return "addressing-method";
  }
  return "generic";
}

function getSwcKind(tagName: string): SwcKind {
  switch (tagName) {
    case "COMPOSITION-SW-COMPONENT-TYPE":
      return "composition";
    case "APPLICATION-SW-COMPONENT-TYPE":
      return "application";
    case "PARAMETER-SW-COMPONENT-TYPE":
      return "parameter";
    case "SENSOR-ACTUATOR-SW-COMPONENT-TYPE":
      return "sensor-actuator";
    case "ECU-ABSTRACTION-SW-COMPONENT-TYPE":
      return "ecu-abstraction";
    case "COMPLEX-DEVICE-DRIVER-SW-COMPONENT-TYPE":
      return "complex-device-driver";
    case "SERVICE-SW-COMPONENT-TYPE":
      return "service";
    case "SERVICE-PROXY-SW-COMPONENT-TYPE":
      return "service-proxy";
    case "NV-BLOCK-SW-COMPONENT-TYPE":
      return "nv-block";
    default:
      return "generic";
  }
}

function resolveOwnerSemanticPath(
  type: EntityType,
  semanticPath: string | undefined,
  currentOwnerSemanticPath: string | undefined
) {
  if (type === "port" || type === "instance") {
    return currentOwnerSemanticPath;
  }
  return semanticPath ?? currentOwnerSemanticPath;
}

function buildConnectionRecord(
  filePath: string,
  currentPath: string,
  tagName: string,
  record: Record<string, unknown>,
  shortName: string | undefined
): PortConnection {
  if (tagName === "ASSEMBLY-SW-CONNECTOR") {
    const providerComponentRef = extractNestedReference(record["PROVIDER-IREF"], "CONTEXT-COMPONENT-REF");
    const requesterComponentRef = extractNestedReference(record["REQUESTER-IREF"], "CONTEXT-COMPONENT-REF");
    const sourcePortRef =
      extractNestedReference(record["PROVIDER-IREF"], "TARGET-P-PORT-REF") ??
      extractNestedReference(record["PROVIDER-IREF"], "PORT-PROTOTYPE-REF");
    const targetPortRef =
      extractNestedReference(record["REQUESTER-IREF"], "TARGET-R-PORT-REF") ??
      extractNestedReference(record["REQUESTER-IREF"], "PORT-PROTOTYPE-REF");

    return {
      id: `${filePath}:${currentPath}:connection`,
      from: sourcePortRef ?? `${currentPath}:provider`,
      to: targetPortRef ?? `${currentPath}:requester`,
      label: shortName ?? tagName,
      filePath,
      kind: "assembly",
      xmlPath: currentPath,
      providerComponentRef,
      requesterComponentRef,
      sourcePortRef,
      targetPortRef,
      unresolved: !sourcePortRef || !targetPortRef
    };
  }

  const innerRef =
    extractNestedReference(record["INNER-PORT-IREF"], "TARGET-P-PORT-REF") ??
    extractNestedReference(record["INNER-PORT-IREF"], "TARGET-R-PORT-REF") ??
    extractNestedReference(record["P-PORT-IN-COMPOSITION-INSTANCE-REF"], "TARGET-P-PORT-REF") ??
    extractNestedReference(record["R-PORT-IN-COMPOSITION-INSTANCE-REF"], "TARGET-R-PORT-REF");
  const innerComponentRef =
    extractNestedReference(record["INNER-PORT-IREF"], "CONTEXT-COMPONENT-REF") ??
    extractNestedReference(record["P-PORT-IN-COMPOSITION-INSTANCE-REF"], "CONTEXT-COMPONENT-REF") ??
    extractNestedReference(record["R-PORT-IN-COMPOSITION-INSTANCE-REF"], "CONTEXT-COMPONENT-REF");
  const outerPortRef = extractReference(record, "OUTER-PORT-REF");

  return {
    id: `${filePath}:${currentPath}:connection`,
    from: innerRef ?? `${currentPath}:inner`,
    to: outerPortRef ?? `${currentPath}:outer`,
    label: shortName ?? tagName,
    filePath,
    kind: "delegation",
    xmlPath: currentPath,
    providerComponentRef: innerComponentRef,
    sourcePortRef: innerRef,
    outerPortRef,
    unresolved: !innerRef || !outerPortRef
  };
}

function getPortKind(tagName: string): PortKind | undefined {
  if (tagName === "P-PORT-PROTOTYPE") {
    return "provided";
  }
  if (tagName === "R-PORT-PROTOTYPE") {
    return "required";
  }
  if (tagName === "PR-PORT-PROTOTYPE") {
    return "provided-required";
  }
  return undefined;
}

function getPortDirection(tagName: string): PortDirection | undefined {
  if (tagName === "P-PORT-PROTOTYPE") {
    return "provided";
  }
  if (tagName === "R-PORT-PROTOTYPE") {
    return "required";
  }
  if (tagName === "PR-PORT-PROTOTYPE") {
    return "provided-required";
  }
  return undefined;
}

function getInterfaceKind(tagName: string): PortInterfaceKind {
  if (tagName.includes("SENDER-RECEIVER")) {
    return "sender-receiver";
  }
  if (tagName.includes("CLIENT-SERVER")) {
    return "client-server";
  }
  if (tagName.includes("MODE-SWITCH")) {
    return "mode-switch";
  }
  if (tagName.includes("NV-DATA")) {
    return "nv-data";
  }
  if (tagName.includes("PARAMETER")) {
    return "parameter";
  }
  if (tagName.includes("TRIGGER")) {
    return "trigger";
  }
  return "unknown";
}

function extractShortName(node: unknown): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const shortName = (node as Record<string, unknown>)["SHORT-NAME"];
  if (typeof shortName === "string") {
    return shortName;
  }
  if (Array.isArray(shortName) && typeof shortName[0] === "string") {
    return shortName[0];
  }
  return undefined;
}

function findFirstShortName(node: unknown): string | undefined {
  const direct = extractShortName(node);
  if (direct) {
    return direct;
  }
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstShortName(item);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findFirstShortName(value);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function extractTypeRef(record: Record<string, unknown>) {
  return (
    extractReference(record, "TYPE-TREF") ??
    extractReference(record, "PROVIDED-INTERFACE-TREF") ??
    extractReference(record, "REQUIRED-INTERFACE-TREF") ??
    extractReference(record, "PROVIDED-REQUIRED-INTERFACE-TREF")
  );
}

function extractPortInterfaceKind(record: Record<string, unknown>): PortInterfaceKind | undefined {
  const destination =
    extractReferenceDestination(record, "PROVIDED-INTERFACE-TREF") ??
    extractReferenceDestination(record, "REQUIRED-INTERFACE-TREF") ??
    extractReferenceDestination(record, "PROVIDED-REQUIRED-INTERFACE-TREF");

  return destination ? getInterfaceKind(destination) : undefined;
}

function extractReferenceDestination(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (isRecord(value) && typeof value["@_DEST"] === "string") {
    return value["@_DEST"];
  }
  return undefined;
}

function extractReference(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.startsWith("/")) {
      return value;
    }
    return undefined;
  }

  const stack = [value as Record<string, unknown>];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const nested of Object.values(current)) {
      if (typeof nested === "string" && nested.startsWith("/")) {
        return nested;
      }
      if (nested && typeof nested === "object") {
        if (Array.isArray(nested)) {
          nested.forEach((entry) => {
            if (entry && typeof entry === "object") {
              stack.push(entry as Record<string, unknown>);
            }
          });
        } else {
          stack.push(nested as Record<string, unknown>);
        }
      }
    }
  }

  return undefined;
}

function extractNestedReference(node: unknown, key: string): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = extractNestedReference(entry, key);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  const record = node as Record<string, unknown>;
  if (key in record) {
    const value = record[key];
    if (typeof value === "string" && value.startsWith("/")) {
      return value;
    }
    if (value && typeof value === "object") {
      return extractReference({ value }, "value");
    }
  }

  for (const nested of Object.values(record)) {
    if (!nested || typeof nested !== "object") {
      continue;
    }
    const found = extractNestedReference(nested, key);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function collectMetadata(record: Record<string, unknown>) {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      metadata[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      metadata[key] = String(value);
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      metadata[key] = value[0];
    } else if (Array.isArray(value) && (typeof value[0] === "number" || typeof value[0] === "boolean")) {
      metadata[key] = String(value[0]);
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readBooleanValue(value: unknown) {
  const rawValue = readSimpleValue(value)?.toLowerCase();
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return undefined;
}

function collectInterfaceDefinitionFeature(
  tagName: string,
  record: Record<string, unknown>,
  currentPath: string,
  interfaceSemanticPath: string | undefined,
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>
) {
  if (!interfaceSemanticPath) {
    return;
  }

  const definition = interfaceDefinitionsByPath.get(interfaceSemanticPath);
  const shortName = extractShortName(record);
  if (!definition || !shortName) {
    return;
  }

  const item: InterfaceMember = {
    id: `${interfaceSemanticPath}:${currentPath}`,
    label: shortName,
    kind: getInterfaceMemberKind(definition.kind, tagName),
    xmlPath: currentPath,
    semanticPath: `${interfaceSemanticPath}/${shortName}`,
    metadata: collectInterfaceMemberMetadata(tagName, record)
  };

  if (tagName === "VARIABLE-DATA-PROTOTYPE") {
    definition.dataElements.push(item);
    return;
  }
  if (tagName === "CLIENT-SERVER-OPERATION") {
    definition.operations.push(item);
    return;
  }
  if (tagName === "APPLICATION-ERROR") {
    definition.applicationErrors.push(item);
    return;
  }
  if (tagName === "PARAMETER-DATA-PROTOTYPE") {
    definition.parameters.push(item);
    return;
  }
  if (tagName === "MODE-DECLARATION-GROUP-PROTOTYPE" || tagName === "MODE-GROUP") {
    definition.modeGroups.push(item);
    return;
  }
  if (tagName === "TRIGGER") {
    definition.triggers.push(item);
  }
}

function getInterfaceMemberKind(interfaceKind: PortInterfaceKind, tagName: string) {
  if (tagName === "CLIENT-SERVER-OPERATION") {
    return "operation";
  }
  if (tagName === "APPLICATION-ERROR") {
    return "applicationError";
  }
  if (tagName === "PARAMETER-DATA-PROTOTYPE") {
    return "parameter";
  }
  if (tagName === "MODE-DECLARATION-GROUP-PROTOTYPE" || tagName === "MODE-GROUP") {
    return "modeGroup";
  }
  if (tagName === "TRIGGER") {
    return "trigger";
  }
  if (interfaceKind === "nv-data") {
    return "nvData";
  }
  return "dataElement";
}

function collectInterfaceMemberMetadata(tagName: string, record: Record<string, unknown>) {
  if (tagName === "CLIENT-SERVER-OPERATION") {
    const argumentsList = toRecordArray(record["ARGUMENTS"])
      .flatMap((entry) => toRecordArray(entry["ARGUMENT-DATA-PROTOTYPE"]))
      .map((entry) => ({
        name: extractShortName(entry) ?? "-",
        type: extractTypeRef(entry) ?? "-",
        direction: readSimpleValue(entry["DIRECTION"]) ?? "-",
        serverPolicy: readSimpleValue(entry["SERVER-ARGUMENT-IMPL-POLICY"]) ?? "-"
      }));
    const errorRefs = toRecordArray(record["POSSIBLE-ERROR-REFS"])
      .flatMap((entry) => toArray(entry["POSSIBLE-ERROR-REF"]))
      .map((entry) => (typeof entry === "string" ? entry : extractReference({ entry }, "entry")))
      .filter((value): value is string => Boolean(value));

    return compactMetadata({
      DESCRIPTION: extractDescription(record),
      ARGUMENTS: argumentsList.length > 0 ? argumentsList.map((argument) => argument.name).join(", ") : undefined,
      "ARGUMENT-DETAILS": argumentsList.length > 0 ? JSON.stringify(argumentsList) : undefined,
      "DIAG-ARG-INTEGRITY": readSimpleValue(record["DIAG-ARG-INTEGRITY"]),
      "FIRE-AND-FORGET": readSimpleValue(record["FIRE-AND-FORGET"]),
      ERRORS: errorRefs.length > 0 ? errorRefs.map(getReferenceLeafName).join(", ") : undefined
    });
  }

  if (tagName === "APPLICATION-ERROR") {
    return compactMetadata({
      "ERROR-CODE": readSimpleValue(record["ERROR-CODE"])
    });
  }

  if (tagName === "VARIABLE-DATA-PROTOTYPE") {
    return compactMetadata({
      DESCRIPTION: extractDescription(record),
      TYPE: extractVariableDataPrototypeTypeRef(record),
      "DATA-CONSTRAINTS": extractSwDataDefPropsReference(record, ["DATA-CONSTR-REF", "DATA-CONSTR-TREF"]),
      "SW-ADDR-METHOD-REF": extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]),
      "IS-QUEUED": extractSwDataDefPropsValue(record, ["IS-QUEUED", "QUEUE-LENGTH"]),
      "SW-CALIBRATION-ACCESS": extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]),
      "INITIAL-VALUE": extractInitialValue(record),
      "INITIAL-VALUE-TYPE": extractInitialValueType(record),
      "HANDLE-INVALID": extractSwDataDefPropsValue(record, ["HANDLE-INVALID", "INVALIDATION-POLICY"])
    });
  }
  if (tagName === "TRIGGER") {
    return compactMetadata({
      "SW-IMPL-POLICY": readSimpleValue(record["SW-IMPL-POLICY"]),
      "TRIGGER-PERIOD": summarizeAutosarValue(record["TRIGGER-PERIOD"]),
    });
  }
  return compactMetadata({
    TYPE: extractTypeRef(record) ?? extractNestedReference(record["SW-DATA-DEF-PROPS"], "TYPE-TREF"),
    "DATA-CONSTRAINTS": extractSwDataDefPropsReference(record, ["DATA-CONSTR-REF", "DATA-CONSTR-TREF"]),
    "SW-ADDR-METHOD-REF": extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]),
    "IS-QUEUED": extractSwDataDefPropsValue(record, ["IS-QUEUED", "QUEUE-LENGTH"]),
    "SW-CALIBRATION-ACCESS": extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]),
    "HANDLE-INVALID": extractSwDataDefPropsValue(record, ["HANDLE-INVALID", "INVALIDATION-POLICY"]),
    "INITIAL-VALUE": extractInitialValue(record),
    "INITIAL-VALUE-TYPE": extractInitialValueType(record)
  });
}

export function enrichPortCommunicationSpecsFromEntities(entities: AutosarEntity[]) {
  resolvePortComSpecValueReferences(entities, buildConstantValueSpecIndexFromEntities(entities));
  const interfaceMembersByRef = buildInterfaceMemberIndexFromEntities(entities);

  entities.forEach((entity) => {
    if (entity.type !== "port" || !entity.typeRef || !entity.metadata?.["COMMUNICATION-SPEC-DETAILS"]) {
      return;
    }

    const interfaceRef = entity.typeRef;
    const details = parseCommunicationSpecDetails(entity.metadata["COMMUNICATION-SPEC-DETAILS"]);
    if (details.length === 0) {
      return;
    }

    const enrichedDetails = details.map((detail) =>
      enrichCommunicationSpecDetail(detail, interfaceMembersByRef, interfaceRef)
    );

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      "COMMUNICATION-SPEC-DETAILS": JSON.stringify(enrichedDetails)
    });
  });
}

export function enrichPortInterfaceMetadataFromEntities(entities: AutosarEntity[]) {
  const interfaceEntities = entities.filter((entity) => entity.type === "interface" && entity.semanticPath);

  entities.forEach((entity) => {
    if (entity.type !== "port" || !entity.typeRef) {
      return;
    }

    const interfaceEntity = resolveInterfaceEntity(interfaceEntities, entity.typeRef);
    const isService = interfaceEntity?.metadata?.["IS-SERVICE"];
    const interfaceMembers = interfaceEntity?.metadata?.["INTERFACE-DATA-ELEMENT-DETAILS"];
    if (!isService && !interfaceMembers) {
      return;
    }

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      "IS-SERVICE": entity.metadata?.["IS-SERVICE"] ?? isService,
      "INTERFACE-MEMBER-DETAILS": entity.metadata?.["INTERFACE-MEMBER-DETAILS"] ?? interfaceMembers
    });
  });
}

function resolveInterfaceEntity(interfaceEntities: AutosarEntity[], typeRef: string) {
  const exact = interfaceEntities.find((entity) => entity.semanticPath === typeRef);
  if (exact) {
    return exact;
  }

  const suffixMatches = interfaceEntities.filter(
    (entity) => entity.semanticPath && referencesSameAutosarPath(typeRef, entity.semanticPath)
  );
  return suffixMatches.length === 1 ? suffixMatches[0] : undefined;
}

function extractVariableDataPrototypeTypeRef(record: Record<string, unknown>) {
  return extractDirectReference(record["TYPE-TREF"]);
}

function extractDirectReference(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.startsWith("/") ? value : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.values(value as Record<string, unknown>).find(
    (entry): entry is string => typeof entry === "string" && entry.startsWith("/")
  );
}

function extractSwDataDefPropsReference(record: Record<string, unknown>, keys: string[]) {
  const propsRecords = getSwDataDefPropsContentRecords(record);
  for (const key of keys) {
    for (const propsRecord of propsRecords) {
      const fromProps = extractDirectReference(propsRecord[key]) ?? extractReference(propsRecord, key);
      if (fromProps) {
        return fromProps;
      }
    }

    const fromRecord = extractDirectReference(record[key]) ?? extractReference(record, key);
    if (fromRecord) {
      return fromRecord;
    }
  }
  return undefined;
}

interface EntityDetailField {
  label: string;
  value: string;
  valueType?: string;
}

interface EntityDetailTable {
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
}

interface EntityDetailPayload {
  fields: EntityDetailField[];
  tables: EntityDetailTable[];
}

function collectEntityMetadata(type: EntityType, tagName: string, record: Record<string, unknown>) {
  const metadata = collectMetadata(record) ?? {};
  const details = buildEntityDetailPayload(type, tagName, record);
  return compactMetadata({
    ...metadata,
    DESCRIPTION: extractDescription(record),
    "ENTITY-DETAILS": details ? JSON.stringify(details) : undefined
  });
}

function buildEntityDetailPayload(
  type: EntityType,
  tagName: string,
  record: Record<string, unknown>
): EntityDetailPayload | undefined {
  const fields: EntityDetailField[] = [];
  const tables: EntityDetailTable[] = [];
  const addField = (label: string, value: string | undefined, valueType?: string) => {
    fields.push({ label, value: value ?? "-", valueType });
  };
  const addReference = (label: string, key: string) => addField(label, extractNestedReference(record, key));

  if (type === "interface") {
    addField("Interface Type", formatAutosarElementName(tagName));
    addField("Is Service", readNestedSimpleValue(record, "IS-SERVICE") ?? "false");
  } else if (type === "application-data-type") {
    addField("Category", readNestedSimpleValue(record, "CATEGORY"));
    addSwDataDefinitionFields(record, addField);

    if (tagName === "APPLICATION-ARRAY-DATA-TYPE") {
      addField("Dynamic Array Size Profile", readNestedSimpleValue(record, "DYNAMIC-ARRAY-SIZE-PROFILE"));
      const rows = toRecordArray(record["ELEMENT"]).map((element) => ({
        name: extractShortName(element) ?? "Element",
        dataType: extractNestedReference(element, "TYPE-TREF") ?? "-",
        maximumElements: readNestedSimpleValue(element, "MAX-NUMBER-OF-ELEMENTS") ?? "-",
        sizeSemantics: readNestedSimpleValue(element, "ARRAY-SIZE-SEMANTICS") ?? "-",
        sizeHandling: readNestedSimpleValue(element, "ARRAY-SIZE-HANDLING") ?? "-",
        indexType: extractNestedReference(element, "INDEX-DATA-TYPE-REF") ?? "-"
      }));
      addDetailTable(tables, "Array Element", [
        ["name", "Name"], ["dataType", "Data Type"], ["maximumElements", "Maximum Elements"],
        ["sizeSemantics", "Size Semantics"], ["sizeHandling", "Size Handling"], ["indexType", "Index Data Type"]
      ], rows);
    } else if (tagName === "APPLICATION-RECORD-DATA-TYPE") {
      const rows = collectContainedRecords(record, "ELEMENTS", "APPLICATION-RECORD-ELEMENT").map((element) => ({
        name: extractShortName(element) ?? "-",
        dataType: extractNestedReference(element, "TYPE-TREF") ?? "-",
        optional: readNestedSimpleValue(element, "IS-OPTIONAL") ?? "false"
      }));
      addDetailTable(tables, "Record Elements", [["name", "Name"], ["dataType", "Data Type"], ["optional", "Optional"]], rows);
    }
  } else if (type === "implementation-data-type") {
    addField("Category", readNestedSimpleValue(record, "CATEGORY"));
    addSwDataDefinitionFields(record, addField);
    addField("Dynamic Array Size Profile", readNestedSimpleValue(record, "DYNAMIC-ARRAY-SIZE-PROFILE"));
    addField("Structure Has Optional Elements", readNestedSimpleValue(record, "IS-STRUCT-WITH-OPTIONAL-ELEMENT"));
    addField("Type Emitter", readNestedSimpleValue(record, "TYPE-EMITTER"));
    addField("Symbol", readNestedSimpleValue(record["SYMBOL-PROPS"], "SYMBOL"));
    const rows = collectContainedRecords(record, "SUB-ELEMENTS", "IMPLEMENTATION-DATA-TYPE-ELEMENT").map((element) => ({
      name: extractShortName(element) ?? "-",
      category: readNestedSimpleValue(element, "CATEGORY") ?? "-",
      dataType: extractNestedReference(element, "IMPLEMENTATION-DATA-TYPE-REF") ?? extractNestedReference(element, "BASE-TYPE-REF") ?? "-",
      arraySize: readNestedSimpleValue(element, "ARRAY-SIZE") ?? "-",
      sizeSemantics: readNestedSimpleValue(element, "ARRAY-SIZE-SEMANTICS") ?? "-",
      optional: readNestedSimpleValue(element, "IS-OPTIONAL") ?? "false"
    }));
    addDetailTable(tables, "Sub-elements", [
      ["name", "Name"], ["category", "Category"], ["dataType", "Data Type"],
      ["arraySize", "Array Size"], ["sizeSemantics", "Size Semantics"], ["optional", "Optional"]
    ], rows);
  } else if (type === "base-type") {
    addField("Size", appendUnit(readNestedSimpleValue(record, "BASE-TYPE-SIZE"), "bits"));
    addField("Encoding", readNestedSimpleValue(record, "BASE-TYPE-ENCODING"));
    addField("Memory Alignment", appendUnit(readNestedSimpleValue(record, "MEM-ALIGNMENT"), "bits"));
    addField("Byte Order", readNestedSimpleValue(record, "BYTE-ORDER"));
    addField("Native Declaration", readNestedSimpleValue(record, "NATIVE-DECLARATION"));
  } else if (type === "unit") {
    addField("Display Name", findNestedStringValue(record["DISPLAY-NAME"], ["L-2", "L-4", "#text"]));
    addField("Factor SI to Unit", readNestedSimpleValue(record, "FACTOR-SI-TO-UNIT"));
    addField("Offset SI to Unit", readNestedSimpleValue(record, "OFFSET-SI-TO-UNIT"));
    addReference("Physical Dimension", "PHYSICAL-DIMENSION-REF");
  } else if (type === "compu-method") {
    addField("Category", readNestedSimpleValue(record, "CATEGORY"));
    addField("Display Format", readNestedSimpleValue(record, "DISPLAY-FORMAT"));
    addReference("Unit", "UNIT-REF");
    addField("Internal to Physical Default Value", readNestedSimpleValue(record["COMPU-INTERNAL-TO-PHYS"], "COMPU-DEFAULT-VALUE"));
    addField("Physical to Internal Default Value", readNestedSimpleValue(record["COMPU-PHYS-TO-INTERNAL"], "COMPU-DEFAULT-VALUE"));
    const rows = [
      ...collectCompuScaleRows(record["COMPU-INTERNAL-TO-PHYS"], "Internal to Physical"),
      ...collectCompuScaleRows(record["COMPU-PHYS-TO-INTERNAL"], "Physical to Internal")
    ];
    addDetailTable(tables, "Conversion Scales", [
      ["direction", "Direction"], ["label", "Label"], ["lower", "Lower Limit"], ["upper", "Upper Limit"],
      ["value", "Value / Text"], ["numerator", "Numerator"], ["denominator", "Denominator"], ["mask", "Mask"]
    ], rows);
  } else if (type === "data-constraint") {
    const rows = collectContainedRecords(record, "DATA-CONSTR-RULES", "DATA-CONSTR-RULE").flatMap((rule, index) =>
      ["INTERNAL-CONSTRS", "PHYS-CONSTRS"].flatMap((key) => toRecordArray(rule[key]).map((constraints) => ({
        rule: String(index + 1),
        kind: key === "INTERNAL-CONSTRS" ? "Internal" : "Physical",
        level: readNestedSimpleValue(rule, "CONSTR-LEVEL") ?? "-",
        lower: readNestedSimpleValue(constraints, "LOWER-LIMIT") ?? "-",
        upper: readNestedSimpleValue(constraints, "UPPER-LIMIT") ?? "-",
        maxGradient: readNestedSimpleValue(constraints, "MAX-GRADIENT") ?? "-",
        maxDifference: readNestedSimpleValue(constraints, "MAX-DIFF") ?? "-",
        monotony: readNestedSimpleValue(constraints, "MONOTONY") ?? "-",
        scaleConstraints: summarizeAutosarValue(constraints["SCALE-CONSTRS"]) ?? "-",
        unit: extractNestedReference(constraints, "UNIT-REF") ?? "-"
      })))
    );
    addDetailTable(tables, "Constraint Rules", [
      ["rule", "Rule"], ["kind", "Kind"], ["level", "Level"], ["lower", "Lower Limit"], ["upper", "Upper Limit"],
      ["scaleConstraints", "Scale Constraints"], ["maxGradient", "Maximum Gradient"], ["maxDifference", "Maximum Difference"],
      ["monotony", "Monotony"], ["unit", "Unit"]
    ], rows);
  } else if (type === "record-layout") {
    const rows = collectDescendantRecords(record, "SW-RECORD-LAYOUT-GROUP").map((group) => ({
      label: readNestedSimpleValue(group, "SHORT-LABEL") ?? "-",
      category: readNestedSimpleValue(group, "CATEGORY") ?? "-",
      axis: readNestedSimpleValue(group, "SW-RECORD-LAYOUT-GROUP-AXIS") ?? "-",
      index: readNestedSimpleValue(group, "SW-RECORD-LAYOUT-GROUP-INDEX") ?? "-",
      from: readNestedSimpleValue(group, "SW-RECORD-LAYOUT-GROUP-FROM") ?? "-",
      to: readNestedSimpleValue(group, "SW-RECORD-LAYOUT-GROUP-TO") ?? "-",
      step: readNestedSimpleValue(group, "SW-RECORD-LAYOUT-GROUP-STEP") ?? "-",
      component: readNestedSimpleValue(group, "SW-RECORD-LAYOUT-COMPONENT") ?? "-"
    }));
    addDetailTable(tables, "Layout Groups", [
      ["label", "Label"], ["category", "Category"], ["axis", "Axis"], ["index", "Index"],
      ["from", "From"], ["to", "To"], ["step", "Step"], ["component", "Component"]
    ], rows);
  } else if (type === "mode-declaration-group") {
    addReference("Initial Mode", "INITIAL-MODE-REF");
    addField("On-transition Value", readNestedSimpleValue(record, "ON-TRANSITION-VALUE"));
    addField("Mode Manager Error Behavior", summarizeAutosarValue(record["MODE-MANAGER-ERROR-BEHAVIOR"]));
    addField("Mode User Error Behavior", summarizeAutosarValue(record["MODE-USER-ERROR-BEHAVIOR"]));
    addDetailTable(tables, "Modes", [["name", "Name"], ["value", "Numeric Value"]],
      collectContainedRecords(record, "MODE-DECLARATIONS", "MODE-DECLARATION").map((mode) => ({
        name: extractShortName(mode) ?? "-", value: readNestedSimpleValue(mode, "VALUE") ?? "-"
      })));
    addDetailTable(tables, "Transitions", [["exited", "Exited Mode"], ["entered", "Entered Mode"]],
      collectContainedRecords(record, "MODE-TRANSITIONS", "MODE-TRANSITION").map((transition) => ({
        exited: extractNestedReference(transition, "EXITED-MODE-REF") ?? "-",
        entered: extractNestedReference(transition, "ENTERED-MODE-REF") ?? "-"
      })));
  } else if (type === "type-mapping-set") {
    addDetailTable(tables, "Data Type Mappings", [["application", "Application Data Type"], ["implementation", "Implementation Data Type"]],
      collectContainedRecords(record, "DATA-TYPE-MAPS", "DATA-TYPE-MAP").map((mapping) => ({
        application: extractNestedReference(mapping, "APPLICATION-DATA-TYPE-REF") ?? "-",
        implementation: extractNestedReference(mapping, "IMPLEMENTATION-DATA-TYPE-REF") ?? "-"
      })));
    addDetailTable(tables, "Mode Request Mappings", [["modeGroup", "Mode Declaration Group"], ["implementation", "Implementation Data Type"]],
      collectContainedRecords(record, "MODE-REQUEST-TYPE-MAPS", "MODE-REQUEST-TYPE-MAP").map((mapping) => ({
        modeGroup: extractNestedReference(mapping, "MODE-GROUP-REF") ?? "-",
        implementation: extractNestedReference(mapping, "IMPLEMENTATION-DATA-TYPE-REF") ?? "-"
      })));
  } else if (type === "addressing-method") {
    addField("Memory Allocation Keyword Policy", readNestedSimpleValue(record, "MEMORY-ALLOCATION-KEYWORD-POLICY"));
    addField("Section Initialization Policy", readNestedSimpleValue(record, "SECTION-INITIALIZATION-POLICY"));
    addField("Section Type", readNestedSimpleValue(record, "SECTION-TYPE"));
    addField("Options", collectSimpleDescendantValues(record["OPTIONS"]).join(", ") || undefined);
  } else {
    return undefined;
  }

  return { fields, tables };
}

function addSwDataDefinitionFields(
  record: Record<string, unknown>,
  addField: (label: string, value: string | undefined) => void
) {
  addField("Base Type", extractSwDataDefPropsReference(record, ["BASE-TYPE-REF"]));
  addField("Implementation Data Type", extractSwDataDefPropsReference(record, ["IMPLEMENTATION-DATA-TYPE-REF"]));
  addField("Compu Method", extractSwDataDefPropsReference(record, ["COMPU-METHOD-REF"]));
  addField("Data Constraint", extractSwDataDefPropsReference(record, ["DATA-CONSTR-REF", "DATA-CONSTR-TREF"]));
  addField("Unit", extractSwDataDefPropsReference(record, ["UNIT-REF"]));
  addField("Addressing Method", extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]));
  addField("Measurement&Calibration", extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]));
}

function addDetailTable(
  tables: EntityDetailTable[],
  title: string,
  columns: Array<[string, string]>,
  rows: Array<Record<string, string>>
) {
  tables.push({ title, columns: columns.map(([key, label]) => ({ key, label })), rows });
}

function collectContainedRecords(record: Record<string, unknown>, containerKey: string, itemKey: string) {
  return toRecordArray(record[containerKey]).flatMap((container) => collectNamedChildren(container, itemKey));
}

function collectDescendantRecords(node: unknown, tagName: string): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectDescendantRecords(entry, tagName));
  }
  if (!isRecord(node)) {
    return [];
  }
  return [
    ...toRecordArray(node[tagName]),
    ...Object.entries(node)
      .filter(([key]) => !key.startsWith("@_"))
      .flatMap(([, value]) => collectDescendantRecords(value, tagName))
  ];
}

function readNestedSimpleValue(node: unknown, key: string): string | undefined {
  if (Array.isArray(node)) {
    for (const entry of node) {
      const value = readNestedSimpleValue(entry, key);
      if (value !== undefined) return value;
    }
    return undefined;
  }
  if (!isRecord(node)) return undefined;
  const direct = readSimpleValue(node[key]);
  if (direct !== undefined) return direct;
  for (const [childKey, child] of Object.entries(node)) {
    if (childKey.startsWith("@_")) continue;
    const value = readNestedSimpleValue(child, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function collectSimpleDescendantValues(node: unknown): string[] {
  const direct = readSimpleValue(node);
  if (direct !== undefined) return [direct];
  if (Array.isArray(node)) return node.flatMap(collectSimpleDescendantValues);
  if (!isRecord(node)) return [];
  return Object.entries(node)
    .filter(([key]) => !key.startsWith("@_"))
    .flatMap(([, value]) => collectSimpleDescendantValues(value));
}

function collectCompuScaleRows(node: unknown, direction: string) {
  return collectDescendantRecords(node, "COMPU-SCALE").map((scale) => ({
    direction,
    label: readNestedSimpleValue(scale, "SHORT-LABEL") ?? "-",
    lower: readNestedSimpleValue(scale, "LOWER-LIMIT") ?? "-",
    upper: readNestedSimpleValue(scale, "UPPER-LIMIT") ?? "-",
    value: readNestedSimpleValue(scale, "VT") ?? readNestedSimpleValue(scale, "V") ?? "-",
    numerator: collectSimpleDescendantValues(scale["COMPU-RATIONAL-COEFFS"] && (scale["COMPU-RATIONAL-COEFFS"] as Record<string, unknown>)["COMPU-NUMERATOR"]).join(", ") || "-",
    denominator: collectSimpleDescendantValues(scale["COMPU-RATIONAL-COEFFS"] && (scale["COMPU-RATIONAL-COEFFS"] as Record<string, unknown>)["COMPU-DENOMINATOR"]).join(", ") || "-",
    mask: readNestedSimpleValue(scale, "MASK") ?? "-"
  }));
}

function appendUnit(value: string | undefined, unit: string) {
  return value ? `${value} ${unit}` : undefined;
}

function formatAutosarElementName(value: string) {
  return value.toLowerCase().split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function extractSwDataDefPropsValue(record: Record<string, unknown>, keys: string[]) {
  const propsRecords = getSwDataDefPropsContentRecords(record);
  for (const propsRecord of propsRecords) {
    for (const key of keys) {
      const fromProps = readSimpleValue(propsRecord[key]);
      if (fromProps) {
        return fromProps;
      }
    }
  }

  for (const key of keys) {
    const simpleValue = readSimpleValue(record[key]);
    if (simpleValue) {
      return simpleValue;
    }
  }

  return undefined;
}

function getSwDataDefPropsContentRecords(record: Record<string, unknown>) {
  const props = record["SW-DATA-DEF-PROPS"];
  if (!props) {
    return [];
  }

  const contentRecords = [
    ...collectSwDataDefPropsConditionalRecords(props),
    ...toRecordArray(props)
  ];
  const seen = new Set<Record<string, unknown>>();
  return contentRecords.filter((entry) => {
    if (seen.has(entry)) {
      return false;
    }
    seen.add(entry);
    return true;
  });
}

function collectSwDataDefPropsConditionalRecords(props: unknown) {
  const conditionals: Record<string, unknown>[] = [];
  for (const propsRecord of toRecordArray(props)) {
    conditionals.push(
      ...collectChildRecords(propsRecord["SW-DATA-DEF-PROPS-VARIANTS"], "SW-DATA-DEF-PROPS-CONDITIONAL")
    );
    conditionals.push(...collectChildRecords(propsRecord, "SW-DATA-DEF-PROPS-CONDITIONAL"));
  }
  return conditionals;
}

function collectChildRecords(container: unknown, childKey: string): Record<string, unknown>[] {
  return toRecordArray(container).flatMap((record) => toRecordArray(record[childKey]));
}

function findNestedStringValueByKey(node: unknown, keys: string[]): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findNestedStringValueByKey(entry, keys);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  const record = node as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }
    const directValue = readSimpleValue(record[key]);
    if (directValue) {
      return directValue;
    }
    const nestedValue = findNestedStringValueByKey(record[key], keys);
    if (nestedValue) {
      return nestedValue;
    }
  }

  for (const value of Object.values(record)) {
    const found = findNestedStringValueByKey(value, keys);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function collectSwcInspectorFeature(
  tagName: string,
  record: Record<string, unknown>,
  currentPath: string,
  ownerSemanticPath: string | undefined,
  inspectorsByOwner: Map<string, MutableSwcInspector>
) {
  if (!ownerSemanticPath) {
    return;
  }

  const inspector = getOrCreateInspector(ownerSemanticPath, inspectorsByOwner);
  const shortName = extractShortName(record);
  if (tagName.endsWith("-EVENT")) {
    const runnableRef = extractReference(record, "START-ON-EVENT-REF");
    const period = readSimpleValue(record["PERIOD"]);
    if (runnableRef && period) {
      inspector.runnablePeriodsByName[getReferenceLeafName(runnableRef)] = period;
    }
    if (runnableRef) {
      const eventName = extractShortName(record) ?? tagName;
      const runnableName = getReferenceLeafName(runnableRef);
      const runnableEvents = (inspector.runnableEventsByName[runnableName] ??= []);
      runnableEvents.push(`${eventName} (${formatAutosarTagLabel(tagName)})`);
      const runnableEventDetails = (inspector.runnableEventDetailsByName[runnableName] ??= []);
      runnableEventDetails.push(collectRunnableTriggerEventDetail(tagName, record, eventName));
    }
  }
  if (tagName === "RUNNABLE-ENTITY") {
    const accessPointDetails = collectRunnableLocalVariableAccessPointDetails(record);
    const runnableName = extractShortName(record);
    if (accessPointDetails.length > 0 && runnableName) {
      inspector.runnableAccessPointDetailsByName[runnableName] = accessPointDetails;
    }
  }
  if (tagName === "PORT-API-OPTION") {
    const portRef = extractReference(record, "PORT-REF");
    if (portRef) {
      inspector.portApiOptionsByPortRef[portRef] = collectPortApiOptionMetadata(record);
    }
  }
  if (PORT_TAGS.has(tagName) && shortName) {
    const interfaceRef = extractTypeRef(record);
    if (interfaceRef) {
      inspector.portInterfacesByName[shortName] = interfaceRef;
    }
  }
  if (tagName === "SWC-SERVICE-DEPENDENCY") {
    for (const assignment of collectNvmBlockNeedAssignments(record)) {
      inspector.nvmBlockNeedsByPimName[assignment.pimName] = assignment.nvmBlockNeed;
    }
  }

  const inspectorSection = getInspectorSectionId(tagName, currentPath);
  if (!inspectorSection || !shortName) {
    return;
  }

  inspector.sections[inspectorSection].push({
    id: `${ownerSemanticPath}:${currentPath}`,
    label: shortName,
    xmlPath: currentPath,
    metadata: collectInspectorMetadata(tagName, record, currentPath)
  });
}

function getInspectorSectionId(
  tagName: string,
  currentPath: string
): SwcInspectorSectionId | undefined {
  if (tagName === "RUNNABLE-ENTITY") {
    return "runnables";
  }
  if (tagName === "PER-INSTANCE-MEMORY") {
    return "perInstanceMemory";
  }
  if (tagName === "VARIABLE-DATA-PROTOTYPE" && /AR-TYPED-PER-INSTANCE-MEMORYS/i.test(currentPath)) {
    return "perInstanceMemory";
  }
  if (tagName === "SWC-SERVICE-DEPENDENCY") {
    return "serviceDependencies";
  }
  if (tagName === "PARAMETER-DATA-PROTOTYPE" || tagName === "CALPRM-ELEMENT-PROTOTYPE") {
    return "calibrationVariables";
  }
  if (
    tagName === "VARIABLE-DATA-PROTOTYPE" &&
    /INTER-RUNNABLE|INTER[-/]?RUNNABLE|PER-INSTANCE|PIM|STATIC-MEMORY/i.test(currentPath)
  ) {
    return "interRunnableVariables";
  }
  return undefined;
}

function getOrCreateInspector(
  ownerSemanticPath: string,
  inspectorsByOwner: Map<string, MutableSwcInspector>
) {
  let inspector = inspectorsByOwner.get(ownerSemanticPath);
  if (!inspector) {
    inspector = {
      ownerSemanticPath,
      sections: {
        runnables: [],
        calibrationVariables: [],
        interRunnableVariables: [],
        perInstanceMemory: [],
        serviceDependencies: [],
        interfaceDataElements: [],
        interfaceOperations: [],
        interfaceApplicationErrors: [],
        interfaceParameters: [],
        interfaceModeGroups: [],
        interfaceTriggers: []
      },
      runnablePeriodsByName: {},
      runnableEventsByName: {},
      runnableEventDetailsByName: {},
      runnableAccessPointDetailsByName: {},
      nvmBlockNeedsByPimName: {},
      portInterfacesByName: {},
      portApiOptionsByPortRef: {}
    };
    inspectorsByOwner.set(ownerSemanticPath, inspector);
  }
  return inspector;
}

function collectInspectorMetadata(tagName: string, record: Record<string, unknown>, currentPath: string) {
  if (tagName === "RUNNABLE-ENTITY") {
    return compactMetadata({
      PERIOD: undefined,
      SYMBOL: readSimpleValue(record["SYMBOL"]),
      "MIN-START-INTERVAL": readSimpleValue(record["MINIMUM-START-INTERVAL"]),
      "SW-ADDR-METHOD-REF": extractReference(record, "SW-ADDR-METHOD-REF"),
      "ACTIVATION-REASONS": collectRunnableActivationReasons(record),
      "ACTIVATION-REASON-DETAILS": collectRunnableActivationReasonDetails(record),
      CONCURRENT: readSimpleValue(record["CAN-BE-INVOKED-CONCURRENTLY"]),
      DESCRIPTION: extractDescription(record),
      "ACCESS-POINTS": collectRunnableAccessPoints(record),
      "ACCESS-POINT-DETAILS": collectRunnableAccessPointDetails(record)
    });
  }

  if (tagName === "PARAMETER-DATA-PROTOTYPE" || tagName === "CALPRM-ELEMENT-PROTOTYPE") {
    return compactMetadata({
      TYPE: extractTypeRef(record),
      "SW-ADDR-METHOD-REF": extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]),
      SCOPE: inferCalibrationParameterScope(currentPath),
      "SW-CALIBRATION-ACCESS": extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]),
      "INITIAL-VALUE": extractInitialValue(record),
      "INITIAL-VALUE-TYPE": extractInitialValueType(record)
    });
  }

  if (tagName === "VARIABLE-DATA-PROTOTYPE" && /INTER[-/]?RUNNABLE/i.test(currentPath)) {
    return compactMetadata({
      ...collectMetadata(record),
      TYPE: extractVariableDataPrototypeTypeRef(record),
      "SW-ADDR-METHOD-REF": extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]),
      "SW-CALIBRATION-ACCESS": extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]),
      "INITIAL-VALUE": extractInitialValue(record),
      "INITIAL-VALUE-TYPE": extractInitialValueType(record),
      COMMUNICATION: inferInterRunnableCommunication(currentPath)
    });
  }

  if (tagName === "PER-INSTANCE-MEMORY") {
    return compactMetadata({
      TYPE: readSimpleValue(record["TYPE"]) ?? extractTypeRef(record),
      "TYPE-DEFINITION": readSimpleValue(record["TYPE-DEFINITION"]),
      "NVM-BLOCK-NEED": extractNvmBlockNeedName(record),
      "SW-ADDR-METHOD-REF": extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]),
      "SW-CALIBRATION-ACCESS": extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]),
      "INITIAL-VALUE": extractInitialValue(record),
      "INITIAL-VALUE-TYPE": extractInitialValueType(record)
    });
  }

  if (tagName === "VARIABLE-DATA-PROTOTYPE" && /AR-TYPED-PER-INSTANCE-MEMORYS/i.test(currentPath)) {
    return compactMetadata({
      ...collectMetadata(record),
      TYPE: extractVariableDataPrototypeTypeRef(record),
      "NVM-BLOCK-NEED": extractNvmBlockNeedName(record),
      "SW-ADDR-METHOD-REF": extractSwDataDefPropsReference(record, ["SW-ADDR-METHOD-REF"]),
      "SW-CALIBRATION-ACCESS": extractSwDataDefPropsValue(record, ["SW-CALIBRATION-ACCESS"]),
      "INITIAL-VALUE": extractInitialValue(record),
      "INITIAL-VALUE-TYPE": extractInitialValueType(record)
    });
  }

  if (tagName === "SWC-SERVICE-DEPENDENCY") {
    return collectServiceDependencyMetadata(record);
  }

  return collectMetadata(record);
}

function inferCalibrationParameterScope(currentPath: string) {
  if (/PER-INSTANCE-PARAMETERS|PER[-/]?INSTANCE[-/]?PARAMETERS/i.test(currentPath)) {
    return "Per Instance";
  }
  if (/SHARED-PARAMETERS|SHARED[-/]?PARAMETERS/i.test(currentPath)) {
    return "Shared";
  }
  return undefined;
}

function inferInterRunnableCommunication(currentPath: string) {
  if (/IMPLICIT-INTER-RUNNABLE-VARIABLES|IMPLICIT[-/]?INTER[-/]?RUNNABLE[-/]?VARIABLES/i.test(currentPath)) {
    return "Implicit";
  }
  if (/EXPLICIT-INTER-RUNNABLE-VARIABLES|EXPLICIT[-/]?INTER[-/]?RUNNABLE[-/]?VARIABLES/i.test(currentPath)) {
    return "Explicit";
  }
  return undefined;
}

function collectServiceDependencyMetadata(record: Record<string, unknown>) {
  const serviceNeed = extractServiceNeed(record);
  const dataAssignments = collectRoleBasedDataAssignmentDetails(record);
  const portAssignments = collectRoleBasedPortAssignmentDetails(record["ASSIGNED-PORTS"]);
  return compactMetadata({
    CATEGORY: readSimpleValue(record["CATEGORY"]),
    "SERVICE-TYPE": serviceNeed?.tag,
    "SERVICE-NEED": serviceNeed?.shortName,
    "ASSIGNED-DATAS": collectRoleBasedAssignmentsSummary(record["ASSIGNED-DATAS"], "data"),
    "ASSIGNED-PORTS": collectRoleBasedAssignmentsSummary(record["ASSIGNED-PORTS"], "port"),
    "ASSIGNED-DATA-DETAILS": dataAssignments.length > 0 ? JSON.stringify(dataAssignments) : undefined,
    "ASSIGNED-DATA-RAM-BLOCK": getRoleBasedDataAssignmentValue(dataAssignments, "ramblock"),
    "ASSIGNED-DATA-DEFAULT-VALUE": getRoleBasedDataAssignmentValue(dataAssignments, "defaultvalue"),
    "ASSIGNED-PORT-DETAILS": portAssignments.length > 0 ? JSON.stringify(portAssignments) : undefined,
    "SERVICE-NEED-DETAIL-FIELDS": serviceNeed ? collectServiceNeedDetailFields(serviceNeed.value) : undefined,
    "SERVICE-NEED-DETAILS": serviceNeed ? summarizeServiceNeedDetails(serviceNeed.value) : undefined
  });
}

function extractServiceNeed(record: Record<string, unknown>) {
  const serviceNeeds = record["SERVICE-NEEDS"];
  for (const entry of toRecordArray(serviceNeeds)) {
    for (const [tag, value] of Object.entries(entry)) {
      if (tag.startsWith("@_")) {
        continue;
      }
      const serviceRecord = toRecordArray(value)[0];
      return {
        tag,
        value,
        shortName: serviceRecord ? extractShortName(serviceRecord) : undefined
      };
    }
  }
  return undefined;
}

function collectRoleBasedAssignmentsSummary(container: unknown, kind: "data" | "port") {
  const childTag = kind === "data" ? "ROLE-BASED-DATA-ASSIGNMENT" : "ROLE-BASED-PORT-ASSIGNMENT";
  const assignments = collectNamedChildren(container, childTag).map((assignment) => {
    const role = readSimpleValue(assignment["ROLE"]) ?? "-";
    const reference =
      kind === "data" ? extractRoleBasedDataAssignmentReference(assignment) : findFirstReferenceValue(assignment);
    const target = reference ? getReferenceLeafName(reference) : "-";
    return `${role}: ${target}`;
  });

  return assignments.length > 0 ? assignments.join(", ") : undefined;
}

function collectRoleBasedDataAssignmentDetails(record: Record<string, unknown>) {
  return collectRoleBasedDataAssignments(record).map((assignment) => {
    const dataElementRef = extractRoleBasedDataAssignmentReference(assignment.record);
    const portRef = extractRoleBasedDataAssignmentPortReference(assignment.record);
    return {
      role: assignment.role,
      value: dataElementRef ? getReferenceLeafName(dataElementRef) : "-",
      dataElementPrototype: dataElementRef ? getReferenceLeafName(dataElementRef) : "-",
      dataElementPrototypeRef: dataElementRef,
      portPrototype: portRef ? getReferenceLeafName(portRef) : "-",
      portPrototypeRef: portRef,
      portInterface: "-"
    };
  });
}

function extractRoleBasedDataAssignmentReference(record: Record<string, unknown>) {
  return (
    extractNestedReference(record, "TARGET-DATA-PROTOTYPE-REF") ??
    extractNestedReference(record, "TARGET-PARAMETER-REF") ??
    extractReference(record, "USED-PIM-REF") ??
    extractReference(record, "USED-DATA-ELEMENT") ??
    extractReference(record, "USED-PARAMETER-ELEMENT") ??
    extractReference(record, "USED-DATA-ELEMENT-REF") ??
    extractReference(record, "USED-PARAMETER-ELEMENT-REF")
  );
}

function extractRoleBasedDataAssignmentPortReference(record: Record<string, unknown>) {
  return (
    extractNestedReference(record, "CONTEXT-PORT-REF") ??
    extractNestedReference(record, "PORT-PROTOTYPE-REF") ??
    extractNestedReference(record, "CONTEXT-P-PORT-REF") ??
    extractNestedReference(record, "CONTEXT-R-PORT-REF")
  );
}

function getRoleBasedDataAssignmentValue(assignments: Array<{ role: string; value: string }>, normalizedRole: string) {
  return assignments.find((assignment) => normalizeAutosarName(assignment.role) === normalizedRole)?.value;
}

function normalizeAutosarName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectRoleBasedPortAssignmentDetails(container: unknown) {
  return collectNamedChildren(container, "ROLE-BASED-PORT-ASSIGNMENT").map((assignment) => {
    const portRef = extractReference(assignment, "PORT-PROTOTYPE-REF") ?? findFirstReferenceValue(assignment);
    return {
      portPrototype: portRef ? getReferenceLeafName(portRef) : "-",
      portPrototypeRef: portRef,
      portInterface: "-",
      assignedRole: readSimpleValue(assignment["ROLE"]) ?? "-"
    };
  });
}

function summarizeServiceNeedDetails(value: unknown) {
  const detailFields = readServiceNeedDetailFields(value);
  return detailFields.length > 0
    ? detailFields.map((detail) => `${detail.label}: ${detail.value}`).join(", ")
    : undefined;
}

function collectServiceNeedDetailFields(value: unknown) {
  const detailFields = readServiceNeedDetailFields(value);
  return detailFields.length > 0 ? JSON.stringify(detailFields) : undefined;
}

function readServiceNeedDetailFields(value: unknown) {
  const records = toRecordArray(value);
  const record = records[0];
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .filter(([key]) => key !== "SHORT-NAME" && !key.startsWith("@_") && key !== "ADMIN-DATA")
    .flatMap(([key, entry]) => {
      const summary = summarizeAutosarValue(entry);
      return summary ? [{ tag: key, label: formatAutosarTagLabel(key), value: summary }] : [];
    });
}

function extractNvmBlockNeedName(record: Record<string, unknown>) {
  return (
    extractShortNameFromNestedRecord(record["NV-BLOCK-NEEDS"]) ??
    extractShortNameFromNestedRecord(record["SERVICE-NEEDS"]) ??
    extractReference(record, "NV-BLOCK-NEEDS-REF") ??
    extractReference(record, "NVM-BLOCK-NEED-REF") ??
    readSimpleValue(record["NVM-BLOCK-NEED"]) ??
    readSimpleValue(record["NVM-BLOCK-NEEDS"])
  );
}

function collectNvmBlockNeedAssignments(record: Record<string, unknown>) {
  const nvmBlockNeed = extractNvmBlockNeedName(record) ?? extractShortName(record);
  if (!nvmBlockNeed) {
    return [];
  }

  return collectRoleBasedDataAssignments(record)
    .filter((assignment) => normalizeAutosarName(assignment.role) === "ramblock")
    .flatMap((assignment) => {
      const variableRef = extractRoleBasedDataAssignmentReference(assignment.record);
      const pimName = variableRef ? getReferenceLeafName(variableRef) : undefined;
      return pimName ? [{ pimName, nvmBlockNeed }] : [];
    });
}

function collectRoleBasedDataAssignments(record: Record<string, unknown>) {
  const assignedDatas = record["ASSIGNED-DATAS"];
  return collectNamedChildren(assignedDatas, "ROLE-BASED-DATA-ASSIGNMENT").map((assignment) => ({
    role: readSimpleValue(assignment["ROLE"]) ?? "-",
    record: assignment
  }));
}

function extractShortNameFromNestedRecord(value: unknown) {
  return toRecordArray(value).map(extractShortName).find((entry): entry is string => Boolean(entry));
}

function collectPortMetadata(record: Record<string, unknown>) {
  return compactMetadata({
    DESCRIPTION: extractDescription(record),
    "IS-SERVICE": readSimpleValue(record["IS-SERVICE"]),
    "COMMUNICATION-SPEC-DETAILS": collectCommunicationSpecDetails(record)
  });
}

function collectConstantMetadata(record: Record<string, unknown>) {
  const value = extractValueSpecificationLabel(record["VALUE-SPEC"]);
  const valueType = extractValueSpecificationType(record["VALUE-SPEC"]);
  return compactMetadata({
    DESCRIPTION: extractDescription(record),
    "VALUE-SPEC": value,
    "VALUE-SPEC-TYPE": valueType,
    "VALUE-SPEC-REF": extractValueSpecificationReference(record["VALUE-SPEC"]),
    "ENTITY-DETAILS": JSON.stringify({
      fields: [
        { label: "Category", value: readNestedSimpleValue(record, "CATEGORY") ?? "-" },
        { label: "Value", value: value ?? "-", valueType }
      ],
      tables: []
    } satisfies EntityDetailPayload)
  });
}

interface CommunicationSpecDetail {
  index: string;
  dataElement: string;
  comSpec: string;
  comSpecDirection: string;
  initValue: string;
  initValueType: string;
  initValueRef?: string;
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
  timeoutSubstitutionValueRef?: string;
  handleTimeoutType: string;
  rxFilter: string;
  handleDataStatus: string;
  queueLength: string;
  dataType?: string;
  dataConstraints?: string;
  addressingMethod?: string;
  useQueuedCommunication?: string;
  measurementCalibration?: string;
  handleInvalid?: string;
}

function collectCommunicationSpecDetails(record: Record<string, unknown>) {
  const details: CommunicationSpecDetail[] = [];
  const collectFromContainer = (containerKey: string) => {
    const container = record[containerKey];
    if (!container || typeof container !== "object") {
      return;
    }
    const containerRecord = container as Record<string, unknown>;
    for (const [comSpecTag, comSpecValue] of Object.entries(containerRecord)) {
      for (const comSpec of toArray(comSpecValue).filter(isRecord)) {
        details.push({
          index: String(details.length + 1),
          dataElement: extractCommunicationSpecDataElement(comSpec),
          comSpec: formatAutosarTagLabel(comSpecTag),
          comSpecDirection: getCommunicationSpecDirection(comSpecTag),
          initValue: extractValueSpecificationLabel(comSpec["INIT-VALUE"]),
          initValueType: extractValueSpecificationType(comSpec["INIT-VALUE"]),
          initValueRef: extractValueSpecificationReference(comSpec["INIT-VALUE"]),
          usesTxAcknowledge: comSpec["TRANSMISSION-ACKNOWLEDGE"] ? "true" : readSimpleValue(comSpec["USES-TX-ACKNOWLEDGE"]) ?? "-",
          transmissionAcknowledgeTimeout:
            extractTransmissionAcknowledgeTimeout(comSpec["TRANSMISSION-ACKNOWLEDGE"]) ?? "-",
          usesEndToEndProtection: readSimpleValue(comSpec["USES-END-TO-END-PROTECTION"]) ?? "-",
          handleOutOfRange: readSimpleValue(comSpec["HANDLE-OUT-OF-RANGE"]) ?? "-",
          transmissionMode: findNestedStringValue(comSpec["TRANSMISSION-PROPS"], ["TRANSMISSION-MODE"]) ?? "-",
          dataUpdatePeriod: readSimpleValue(comSpec["DATA-UPDATE-PERIOD"]) ??
            findNestedStringValue(comSpec["TRANSMISSION-PROPS"], ["DATA-UPDATE-PERIOD"]) ??
            "-",
          minimumSendInterval: readSimpleValue(comSpec["MINIMUM-SEND-INTERVAL"]) ??
            findNestedStringValue(comSpec["TRANSMISSION-PROPS"], ["MINIMUM-SEND-INTERVAL"]) ??
            "-",
          aliveTimeout: readSimpleValue(comSpec["ALIVE-TIMEOUT"]) ?? "-",
          enableUpdate: readSimpleValue(comSpec["ENABLE-UPDATE"]) ?? "-",
          handleNeverReceived: readSimpleValue(comSpec["HANDLE-NEVER-RECEIVED"]) ?? "-",
          usesEndToEndProtectionErrorHandling:
            readSimpleValue(comSpec["USES-END-TO-END-PROTECTION-ERROR-HANDLING"]) ?? "-",
          timeoutSubstitutionValue: extractValueSpecificationLabel(comSpec["TIMEOUT-SUBSTITUTION-VALUE"]),
          timeoutSubstitutionValueType: extractValueSpecificationType(comSpec["TIMEOUT-SUBSTITUTION-VALUE"]),
          timeoutSubstitutionValueRef: extractValueSpecificationReference(comSpec["TIMEOUT-SUBSTITUTION-VALUE"]),
          handleTimeoutType: readSimpleValue(comSpec["HANDLE-TIMEOUT-TYPE"]) ?? "-",
          rxFilter: summarizeAutosarValue(comSpec["FILTER"]) ?? "-",
          handleDataStatus: readSimpleValue(comSpec["HANDLE-DATA-STATUS"]) ?? "-",
          queueLength: readSimpleValue(comSpec["QUEUE-LENGTH"]) ?? "-",
          useQueuedCommunication: getCommunicationSpecQueuedState(comSpecTag)
        });
      }
    }
  };

  collectFromContainer("PROVIDED-COM-SPECS");
  collectFromContainer("REQUIRED-COM-SPECS");

  return details.length > 0 ? JSON.stringify(details) : undefined;
}

function getCommunicationSpecDirection(comSpecTag: string) {
  if (/RECEIVER/i.test(comSpecTag)) {
    return "receiver";
  }
  if (/SENDER/i.test(comSpecTag)) {
    return "sender";
  }
  if (/CLIENT/i.test(comSpecTag)) {
    return "client";
  }
  if (/SERVER/i.test(comSpecTag)) {
    return "server";
  }
  if (/PARAMETER/i.test(comSpecTag)) {
    return "parameter";
  }
  if (/MODE/i.test(comSpecTag)) {
    return "mode";
  }
  if (/TRIGGER/i.test(comSpecTag)) {
    return "trigger";
  }
  return "unknown";
}

function getCommunicationSpecQueuedState(comSpecTag: string) {
  if (/NONQUEUED/i.test(comSpecTag)) {
    return "false";
  }
  if (/QUEUED/i.test(comSpecTag)) {
    return "true";
  }
  return undefined;
}

function extractTransmissionAcknowledgeTimeout(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }
  return readSimpleValue(value["TIMEOUT"]);
}

const VALUE_SPECIFICATION_TAGS = new Set([
  "APPLICATION-ASSOC-MAP-VALUE-SPECIFICATION",
  "APPLICATION-RULE-BASED-VALUE-SPECIFICATION",
  "APPLICATION-VALUE-SPECIFICATION",
  "ARRAY-VALUE-SPECIFICATION",
  "COMPOSITE-RULE-BASED-VALUE-SPECIFICATION",
  "CONSTANT-REFERENCE",
  "NOT-AVAILABLE-VALUE-SPECIFICATION",
  "NUMERICAL-RULE-BASED-VALUE-SPECIFICATION",
  "NUMERICAL-VALUE-SPECIFICATION",
  "RECORD-VALUE-SPECIFICATION",
  "REFERENCE-VALUE-SPECIFICATION",
  "TEXT-VALUE-SPECIFICATION"
]);

function extractValueSpecificationType(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "-";
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found: string = extractValueSpecificationType(entry);
      if (found !== "-") {
        return found;
      }
    }
    return "-";
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!key.startsWith("@_") && /VALUE|SPECIFICATION|CONSTANT/i.test(key)) {
      return formatAutosarTagLabel(key);
    }
  }
  return "-";
}

function extractValueSpecificationReference(value: unknown): string | undefined {
  const specification = findValueSpecification(value);
  if (!specification || specification.tag !== "CONSTANT-REFERENCE") {
    return undefined;
  }
  return extractNestedReference(specification.value, "CONSTANT-REF");
}

function extractCommunicationSpecDataElement(record: Record<string, unknown>) {
  return (
    extractNestedReference(record, "DATA-ELEMENT-REF") ??
    extractNestedReference(record, "OPERATION-REF") ??
    extractNestedReference(record, "PARAMETER-REF") ??
    extractNestedReference(record, "MODE-GROUP-REF") ??
    extractNestedReference(record, "TRIGGER-REF") ??
    extractNestedReference(record, "VARIABLE-REF") ??
    "-"
  );
}

function summarizeAutosarValue(value: unknown): string | undefined {
  const simpleValue = readSimpleValue(value);
  if (simpleValue) {
    return simpleValue;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value)) {
    const summaries = value.map(summarizeAutosarValue).filter((entry): entry is string => Boolean(entry));
    return summaries.length > 0 ? summaries.join(", ") : undefined;
  }

  const record = value as Record<string, unknown>;
  const references = Object.entries(record)
    .filter(([key]) => key.endsWith("-REF") || key.endsWith("-TREF") || key.endsWith("-IREF"))
    .map(([key, entry]) => {
      const ref = extractNestedReference({ [key]: entry }, key);
      return ref ? `${formatAutosarTagLabel(key)}: ${getReferenceLeafName(ref)}` : undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
  if (references.length > 0) {
    return references.join(", ");
  }

  const values = Object.entries(record)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([key, entry]) => {
      const nested = summarizeAutosarValue(entry);
      return nested ? `${formatAutosarTagLabel(key)}: ${nested}` : undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values.slice(0, 4).join(", ") : undefined;
}

function collectPortApiOptionMetadata(record: Record<string, unknown>) {
  return compactMetadata({
    "ENABLE-INDIRECT-API": readSimpleValue(record["INDIRECT-API"]),
    "ENABLE-API-USAGE-BY-ADDRESS": readSimpleValue(record["ENABLE-TAKE-ADDRESS"]),
    "TRANSFORMATION-ERROR-HANDLING": readSimpleValue(record["ERROR-HANDLING"]),
    "PORT-DEFINED-ARGUMENT-VALUES": collectPortDefinedArgumentValues(record)
  }) ?? {};
}

interface PortDefinedArgumentValueDetail {
  index: string;
  name: string;
  dataType: string;
  value: string;
}

function collectPortDefinedArgumentValues(record: Record<string, unknown>) {
  const details = collectNamedChildren(record["PORT-ARG-VALUES"], "PORT-DEFINED-ARGUMENT-VALUE").map(
    (argumentValue, index) => ({
      index: String(index + 1),
      name: extractPortDefinedArgumentName(argumentValue),
      dataType: extractReference(argumentValue, "VALUE-TYPE-TREF") ?? "-",
      value: extractValueSpecificationLabel(argumentValue["VALUE"])
    })
  );

  return details.length > 0 ? JSON.stringify(details) : undefined;
}

function extractPortDefinedArgumentName(record: Record<string, unknown>) {
  return extractShortName(record) ?? findNestedStringValue(record["VALUE"], ["SHORT-LABEL"]) ?? "-";
}

function extractValueSpecificationLabel(
  value: unknown,
  resolveConstantReference?: (reference: string, visited: Set<string>) => string | undefined,
  visited = new Set<string>()
): string {
  const label = formatValueSpecification(value, resolveConstantReference, visited);
  return label ?? "-";
}

function formatValueSpecification(
  value: unknown,
  resolveConstantReference: ((reference: string, visited: Set<string>) => string | undefined) | undefined,
  visited: Set<string>
): string | undefined {
  const specification = findValueSpecification(value);
  if (!specification) {
    return readSimpleValue(value) ?? findNestedStringValue(value, ["VALUE", "TEXT", "#text"]);
  }

  const record = isRecord(specification.value) ? specification.value : undefined;
  switch (specification.tag) {
    case "NUMERICAL-VALUE-SPECIFICATION":
    case "NUMERICAL-RULE-BASED-VALUE-SPECIFICATION":
    case "TEXT-VALUE-SPECIFICATION":
      return record ? readSimpleValue(record["VALUE"]) ?? readSimpleValue(record["TEXT"]) : readSimpleValue(specification.value);
    case "CONSTANT-REFERENCE": {
      const reference = record ? extractNestedReference(record, "CONSTANT-REF") : undefined;
      if (!reference) {
        return undefined;
      }
      return resolveConstantReference?.(reference, visited) ?? reference;
    }
    case "REFERENCE-VALUE-SPECIFICATION": {
      const reference = record ? extractNestedReference(record, "REFERENCE-VALUE-REF") : undefined;
      return reference ? getReferenceLeafName(reference) : undefined;
    }
    case "NOT-AVAILABLE-VALUE-SPECIFICATION":
      return "Not Available";
    case "APPLICATION-VALUE-SPECIFICATION":
      return record ? formatApplicationValueSpecification(record, resolveConstantReference, visited) : undefined;
    case "ARRAY-VALUE-SPECIFICATION":
      return record ? formatCompositeValueSpecification(record["ELEMENTS"], "array", resolveConstantReference, visited) : undefined;
    case "RECORD-VALUE-SPECIFICATION":
      return record ? formatCompositeValueSpecification(record["FIELDS"], "record", resolveConstantReference, visited) : undefined;
    case "APPLICATION-ASSOC-MAP-VALUE-SPECIFICATION":
    case "APPLICATION-RULE-BASED-VALUE-SPECIFICATION":
    case "COMPOSITE-RULE-BASED-VALUE-SPECIFICATION":
      return summarizeAutosarValue(specification.value);
    default:
      return undefined;
  }
}

function findValueSpecification(value: unknown): { tag: string; value: unknown } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findValueSpecification(entry);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (VALUE_SPECIFICATION_TAGS.has(key)) {
      const firstEntry = Array.isArray(entry) ? entry[0] : entry;
      return { tag: key, value: firstEntry };
    }
  }

  for (const entry of Object.values(record)) {
    const found = findValueSpecification(entry);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function formatApplicationValueSpecification(
  record: Record<string, unknown>,
  resolveConstantReference: ((reference: string, visited: Set<string>) => string | undefined) | undefined,
  visited: Set<string>
) {
  const values = formatSwValueCont(record["SW-VALUE-CONT"]);
  if (values) {
    return values;
  }

  const axisValues = formatSwValueCont(record["SW-AXIS-CONTS"]);
  if (axisValues) {
    return axisValues;
  }

  return formatValueSpecification(record["VALUE"], resolveConstantReference, visited);
}

function formatCompositeValueSpecification(
  container: unknown,
  kind: "array" | "record",
  resolveConstantReference: ((reference: string, visited: Set<string>) => string | undefined) | undefined,
  visited: Set<string>
) {
  const entries = collectValueSpecificationEntries(container).map((entry) => {
    const label = isRecord(entry.value) ? readSimpleValue(entry.value["SHORT-LABEL"]) : undefined;
    const value = formatValueSpecification({ [entry.tag]: entry.value }, resolveConstantReference, visited) ?? "-";
    return kind === "record" && label ? `${label}: ${value}` : value;
  });

  if (entries.length === 0) {
    return undefined;
  }

  return kind === "array" ? `[${entries.join(",")}]` : `{${entries.join(", ")}}`;
}

function collectValueSpecificationEntries(value: unknown): Array<{ tag: string; value: unknown }> {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectValueSpecificationEntries);
  }

  const record = value as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, entry]) => {
    if (VALUE_SPECIFICATION_TAGS.has(key)) {
      return toArray(entry).map((nestedValue) => ({ tag: key, value: nestedValue }));
    }
    if (key.startsWith("@_") || key === "SHORT-LABEL") {
      return [];
    }
    return collectValueSpecificationEntries(entry);
  });
}

function formatSwValueCont(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return readSimpleValue(value);
  }
  if (Array.isArray(value)) {
    const values = value.map(formatSwValueCont).filter((entry): entry is string => Boolean(entry));
    return values.length > 0 ? values.join(", ") : undefined;
  }

  const record = value as Record<string, unknown>;
  const values = [
    ...collectSwValues(record["SW-VALUES"]),
    ...collectSwValues(record["SW-AXIS-CONT"]),
    ...collectSwValues(record["SW-VALUE-CONT"])
  ];
  return values.length > 0 ? values.join(",") : undefined;
}

function collectSwValues(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  const simpleValue = readSimpleValue(value);
  if (simpleValue !== undefined) {
    return [simpleValue];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectSwValues);
  }
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    if (key === "V" || key === "VT" || key === "VTF" || key === "VF") {
      return toArray(entry).flatMap(collectSwValues);
    }
    if (key === "VG") {
      return collectSwValues(entry);
    }
    return [];
  });
}

function collectRunnableAccessPoints(record: Record<string, unknown>) {
  const accessPointNames: string[] = [];
  const accessContainerPattern = /ACCESS|POINT|TRIGGERING/i;

  const visit = (value: unknown, ancestorKeys: string[]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, ancestorKeys));
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const nestedRecord = value as Record<string, unknown>;
    const shortName = extractShortName(nestedRecord);
    if (shortName && ancestorKeys.some((key) => accessContainerPattern.test(key))) {
      accessPointNames.push(shortName);
    }

    for (const [key, nestedValue] of Object.entries(nestedRecord)) {
      if (key === "SHORT-NAME" || key.startsWith("@_")) {
        continue;
      }
      visit(nestedValue, [...ancestorKeys, key]);
    }
  };

  visit(record, []);
  return accessPointNames.length > 0 ? Array.from(new Set(accessPointNames)).join(", ") : undefined;
}

function collectRunnableActivationReasons(record: Record<string, unknown>) {
  const reasons = collectNamedChildren(record["ACTIVATION-REASONS"], "EXECUTABLE-ENTITY-ACTIVATION-REASON")
    .map((activationReason) => extractShortName(activationReason))
    .filter((name): name is string => Boolean(name));

  return reasons.length > 0 ? Array.from(new Set(reasons)).join(", ") : undefined;
}

interface RunnableActivationReasonDetail {
  bit: string;
  name: string;
  symbol: string;
}

function collectRunnableActivationReasonDetails(record: Record<string, unknown>) {
  const reasons = collectNamedChildren(record["ACTIVATION-REASONS"], "EXECUTABLE-ENTITY-ACTIVATION-REASON").map(
    (activationReason) => ({
      bit: readSimpleValue(activationReason["BIT-POSITION"]) ?? "-",
      name: extractShortName(activationReason) ?? "-",
      symbol: readSimpleValue(activationReason["SYMBOL"]) ?? "-"
    })
  );

  return reasons.length > 0 ? JSON.stringify(dedupeRunnableActivationReasonDetails(reasons)) : undefined;
}

function dedupeRunnableActivationReasonDetails(details: RunnableActivationReasonDetail[]) {
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = `${detail.bit}\u0000${detail.name}\u0000${detail.symbol}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

interface RunnableAccessPointDetail {
  target: string;
  access: string;
  name: string;
}

const runnableAccessContainers: Record<string, { access: string; childTags: string[] }> = {
  "DATA-READ-ACCESSS": { access: "Read (implicit)", childTags: ["VARIABLE-ACCESS"] },
  "DATA-WRITE-ACCESSS": { access: "Write (implicit)", childTags: ["VARIABLE-ACCESS"] },
  "DATA-RECEIVE-POINT-BY-ARGUMENTS": { access: "Receive by argument", childTags: ["VARIABLE-ACCESS"] },
  "DATA-RECEIVE-POINT-BY-VALUES": { access: "Receive by value", childTags: ["VARIABLE-ACCESS"] },
  "DATA-SEND-POINTS": { access: "Write (explicit)", childTags: ["VARIABLE-ACCESS"] },
  "PARAMETER-ACCESSS": { access: "Parameter read", childTags: ["PARAMETER-ACCESS"] },
  "READ-LOCAL-VARIABLES": { access: "Read local variable", childTags: ["VARIABLE-ACCESS"] },
  "WRITTEN-LOCAL-VARIABLES": { access: "Write local variable", childTags: ["VARIABLE-ACCESS"] },
  "EXTERNAL-TRIGGERING-POINTS": { access: "External trigger", childTags: ["EXTERNAL-TRIGGERING-POINT"] },
  "INTERNAL-TRIGGERING-POINTS": { access: "Internal trigger", childTags: ["INTERNAL-TRIGGERING-POINT"] },
  "ASYNCHRONOUS-SERVER-CALL-RESULT-POINTS": {
    access: "Asynchronous result",
    childTags: ["ASYNCHRONOUS-SERVER-CALL-RESULT-POINT"]
  }
};

function collectRunnableAccessPointDetails(record: Record<string, unknown>) {
  const details = collectRunnableAccessPointDetailsRaw(record);
  return details.length > 0 ? JSON.stringify(dedupeRunnableAccessPointDetails(details)) : undefined;
}

function collectRunnableAccessPointDetailsRaw(record: Record<string, unknown>) {
  const details: RunnableAccessPointDetail[] = [];

  for (const [containerKey, definition] of Object.entries(runnableAccessContainers)) {
    const container = record[containerKey];
    if (!container) {
      continue;
    }

    for (const childTag of definition.childTags) {
      for (const child of collectNamedChildren(container, childTag)) {
        details.push({
          target: extractRunnableAccessTarget(child),
          access: definition.access,
          name: extractShortName(child) ?? "-"
        });
      }
    }
  }

  const serverCallContainer = record["SERVER-CALL-POINTS"];
  for (const child of collectNamedChildren(serverCallContainer, "SYNCHRONOUS-SERVER-CALL-POINT")) {
    details.push({
      target: extractRunnableAccessTarget(child),
      access: formatServerCallAccess(child, "Synchronous call"),
      name: extractShortName(child) ?? "-"
    });
  }
  for (const child of collectNamedChildren(serverCallContainer, "ASYNCHRONOUS-SERVER-CALL-POINT")) {
    details.push({
      target: extractRunnableAccessTarget(child),
      access: formatServerCallAccess(child, "Asynchronous call"),
      name: extractShortName(child) ?? "-"
    });
  }

  return dedupeRunnableAccessPointDetails(details);
}

function collectRunnableLocalVariableAccessPointDetails(record: Record<string, unknown>) {
  const details: RunnableAccessPointDetail[] = [];
  const localAccessContainers: Array<[string, string]> = [
    ["READ-LOCAL-VARIABLES", "Read"],
    ["WRITTEN-LOCAL-VARIABLES", "Write"]
  ];

  for (const [containerKey, access] of localAccessContainers) {
    const container = record[containerKey];
    if (!container) {
      continue;
    }

    for (const child of collectNamedChildren(container, "VARIABLE-ACCESS")) {
      const accessName = extractShortName(child) ?? "-";
      details.push({
        target: extractRunnableAccessTarget(child, accessName),
        access,
        name: accessName
      });
    }
  }

  return dedupeRunnableAccessPointDetails(details);
}

function collectNamedChildren(container: unknown, childTag: string): Record<string, unknown>[] {
  if (!container || typeof container !== "object") {
    return [];
  }

  if (Array.isArray(container)) {
    return container.flatMap((entry) => collectNamedChildren(entry, childTag));
  }

  const record = container as Record<string, unknown>;
  return toArray(record[childTag]).filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRunnableAccessTarget(record: Record<string, unknown>, accessName?: string) {
  const preferredReferenceKeys = [
    "TARGET-DATA-PROTOTYPE-REF",
    "TARGET-REQUIRED-OPERATION-REF",
    "TARGET-PROVIDED-OPERATION-REF",
    "TARGET-TRIGGER-REF",
    "TARGET-MODE-DECLARATION-GROUP-PROTOTYPE-REF",
    "TARGET-PARAMETER-REF",
    "LOCAL-VARIABLE-REF",
    "TARGET-R-PORT-REF",
    "TARGET-P-PORT-REF",
    "CONTEXT-R-PORT-REF",
    "CONTEXT-P-PORT-REF"
  ];

  for (const key of preferredReferenceKeys) {
    const reference = extractNestedReference(record, key);
    if (reference) {
      return getReferenceLeafName(reference);
    }
  }

  const firstReference = findFirstReferenceValue(record);
  return firstReference ? getReferenceLeafName(firstReference) : inferLocalVariableNameFromAccessName(accessName) ?? "-";
}

function inferLocalVariableNameFromAccessName(accessName: string | undefined) {
  if (!accessName || accessName === "-") {
    return undefined;
  }
  const withoutPrefix = accessName.replace(/^(Read|Write|Written|Get|Set)/i, "");
  return withoutPrefix || accessName;
}

function findFirstReferenceValue(node: unknown): string | undefined {
  if (typeof node === "string") {
    return node.startsWith("/") ? node : undefined;
  }
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findFirstReferenceValue(entry);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findFirstReferenceValue(value);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function formatServerCallAccess(record: Record<string, unknown>, fallback: string) {
  const timeout = readSimpleValue(record["TIMEOUT"]);
  return timeout ? `${fallback}, timeout: ${timeout} sec` : fallback;
}

function dedupeRunnableAccessPointDetails(details: RunnableAccessPointDetail[]) {
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = `${detail.target}\u0000${detail.access}\u0000${detail.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectRunnableTriggerEventDetail(
  tagName: string,
  record: Record<string, unknown>,
  eventName: string
): RunnableTriggerEventDetail {
  return {
    trigger: extractRunnableTriggerValue(tagName, record),
    type: formatAutosarTagLabel(tagName),
    disabledInModes: extractDisabledModeLabels(record),
    activationReason: extractActivationReasonLabel(record),
    name: eventName
  };
}

function extractRunnableTriggerValue(tagName: string, record: Record<string, unknown>) {
  const period = readSimpleValue(record["PERIOD"]);
  if (tagName === "TIMING-EVENT" && period) {
    return formatSecondsAsMilliseconds(period);
  }

  const preferredReferenceKeys = [
    "TARGET-DATA-PROTOTYPE-REF",
    "TARGET-REQUIRED-OPERATION-REF",
    "TARGET-PROVIDED-OPERATION-REF",
    "TARGET-MODE-DECLARATION-REF",
    "TARGET-MODE-DECLARATION-GROUP-PROTOTYPE-REF",
    "TARGET-TRIGGER-REF",
    "ASYNCHRONOUS-SERVER-CALL-POINT-REF",
    "EVENT-SOURCE-REF"
  ];

  for (const key of preferredReferenceKeys) {
    const reference = extractNestedReference(record, key);
    if (reference) {
      return getReferenceLeafName(reference);
    }
  }

  const firstReference = findFirstReferenceValue(record);
  return firstReference ? getReferenceLeafName(firstReference) : "-";
}

function extractDisabledModeLabels(record: Record<string, unknown>) {
  const disabledModeRefs = record["DISABLED-MODE-IREFS"];
  const references = findAllReferenceValues(disabledModeRefs);
  return references.length > 0 ? references.map(getReferenceLeafName).join(", ") : "-";
}

function extractActivationReasonLabel(record: Record<string, unknown>) {
  const reference = extractNestedReference(record, "ACTIVATION-REASON-REPRESENTATION-REF");
  return reference ? getReferenceLeafName(reference) : "-";
}

function formatSecondsAsMilliseconds(value: string) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return `${value} ms`;
  }

  const milliseconds = seconds * 1000;
  return `${Number.isInteger(milliseconds) ? milliseconds : milliseconds.toFixed(3).replace(/\.?0+$/, "")} ms`;
}

function findAllReferenceValues(node: unknown): string[] {
  if (typeof node === "string") {
    return node.startsWith("/") ? [node] : [];
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(findAllReferenceValues);
  }

  return Object.values(node as Record<string, unknown>).flatMap(findAllReferenceValues);
}

function dedupeRunnableTriggerEventDetails(details: RunnableTriggerEventDetail[]) {
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = `${detail.trigger}\u0000${detail.type}\u0000${detail.disabledInModes}\u0000${detail.activationReason}\u0000${detail.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractDescription(record: Record<string, unknown>) {
  return findNestedStringValue(record["DESC"], ["L-2", "#text", "L-4", "L-1"]) ?? readSimpleValue(record["DESC"]);
}

function formatAutosarTagLabel(tagName: string) {
  return tagName
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactMetadata(metadata: Record<string, string | undefined>) {
  const entries = Object.entries(metadata).filter(([, value]) => value);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function readSimpleValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = readSimpleValue(entry);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (isRecord(value)) {
    const textValue = value["#text"] ?? value["_"] ?? value["value"];
    if (typeof textValue === "string") {
      return textValue;
    }
    if (typeof textValue === "number" || typeof textValue === "boolean") {
      return String(textValue);
    }
  }
  return undefined;
}

function attachInterfaceDefinitionMetadataToEntities(
  entities: AutosarEntity[],
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>
) {
  entities.forEach((entity) => {
    if (entity.type !== "interface" || !entity.semanticPath) {
      return;
    }

    const interfaceDefinition = interfaceDefinitionsByPath.get(entity.semanticPath);
    const interfaceMembers = interfaceDefinition ? getInterfaceDefinitionMembers(interfaceDefinition) : [];
    if (interfaceMembers.length === 0) {
      return;
    }

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      "INTERFACE-DATA-ELEMENT-DETAILS": JSON.stringify(interfaceMembers.map(serializeInterfaceMember))
    });
  });
}

function getInterfaceDefinitionMembers(definition: InterfaceDefinition) {
  return [
    ...definition.dataElements,
    ...definition.operations,
    ...definition.parameters,
    ...definition.modeGroups,
    ...definition.triggers,
    ...definition.applicationErrors
  ];
}

function serializeInterfaceMember(member: InterfaceMember): SerializedInterfaceMember {
  return {
    label: member.label,
    kind: member.kind,
    semanticPath: member.semanticPath,
    metadata: member.metadata
  };
}

function attachInspectorsToEntities(
  entities: AutosarEntity[],
  inspectorsByOwner: Map<string, MutableSwcInspector>,
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>,
  validationIssues: ValidationIssue[]
) {
  const entityBySemanticPath = new Map(
    entities
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath!, entity])
  );

  attachPortApiOptionsToEntities(entities, inspectorsByOwner);
  attachInterfaceMetadataToPortComSpecs(entities, interfaceDefinitionsByPath);

  entities.forEach((entity) => {
    if (entity.type !== "swc" && entity.type !== "composition") {
      return;
    }

    const inspector = entity.semanticPath ? inspectorsByOwner.get(entity.semanticPath) : undefined;
    const nextInspector = inspector ?? getOrCreateInspector(entity.semanticPath ?? entity.path, inspectorsByOwner);
    attachInterfaceSections(entity, entities, entityBySemanticPath, interfaceDefinitionsByPath, nextInspector, validationIssues);
    entity.inspector = toSwcInspectorData(entity, nextInspector);
  });
}

function attachInterfaceMetadataToPortComSpecs(
  entities: AutosarEntity[],
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>
) {
  const interfaceMembersByRef = buildInterfaceMemberIndexFromDefinitions(interfaceDefinitionsByPath);

  entities.forEach((entity) => {
    if (entity.type !== "port" || !entity.typeRef || !entity.metadata?.["COMMUNICATION-SPEC-DETAILS"]) {
      return;
    }

    const details = parseCommunicationSpecDetails(entity.metadata["COMMUNICATION-SPEC-DETAILS"]);
    if (details.length === 0) {
      return;
    }

    const enrichedDetails = details.map((detail) =>
      enrichCommunicationSpecDetail(detail, interfaceMembersByRef, entity.typeRef!)
    );

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      "COMMUNICATION-SPEC-DETAILS": JSON.stringify(enrichedDetails)
    });
  });
}

function buildInterfaceMemberIndexFromDefinitions(interfaceDefinitionsByPath: Map<string, InterfaceDefinition>) {
  const membersByRef = new Map<string, SerializedInterfaceMember>();
  interfaceDefinitionsByPath.forEach((definition) => {
    getInterfaceDefinitionMembers(definition).forEach((member) => {
      const serialized = serializeInterfaceMember(member);
      if (member.semanticPath) {
        membersByRef.set(buildInterfaceMemberKey(definition.semanticPath, member.semanticPath), serialized);
      }
      membersByRef.set(buildInterfaceMemberKey(definition.semanticPath, `${definition.semanticPath}/${member.label}`), serialized);
    });
  });
  return membersByRef;
}

function buildInterfaceMemberIndexFromEntities(entities: AutosarEntity[]) {
  const membersByRef = new Map<string, SerializedInterfaceMember>();
  entities.forEach((entity) => {
    if (entity.type !== "interface" || !entity.semanticPath) {
      return;
    }

    parseSerializedInterfaceMembers(entity.metadata?.["INTERFACE-DATA-ELEMENT-DETAILS"]).forEach((member) => {
      if (member.semanticPath) {
        membersByRef.set(buildInterfaceMemberKey(entity.semanticPath!, member.semanticPath), member);
      }
      membersByRef.set(buildInterfaceMemberKey(entity.semanticPath!, `${entity.semanticPath}/${member.label}`), member);
    });
  });
  return membersByRef;
}

function parseSerializedInterfaceMembers(value: string | undefined): SerializedInterfaceMember[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const label = readSimpleValue(entry.label);
      if (!label) {
        return [];
      }

      return [
        {
          label,
          kind: readSimpleValue(entry.kind),
          semanticPath: readSimpleValue(entry.semanticPath),
          metadata: isRecord(entry.metadata) ? stringifyMetadataRecord(entry.metadata) : undefined
        }
      ];
    });
  } catch {
    return [];
  }
}

function stringifyMetadataRecord(record: Record<string, unknown>) {
  const metadata: Record<string, string> = {};
  Object.entries(record).forEach(([key, value]) => {
    const stringValue = readSimpleValue(value);
    if (stringValue) {
      metadata[key] = stringValue;
    }
  });
  return metadata;
}

function enrichCommunicationSpecDetail(
  detail: CommunicationSpecDetail,
  interfaceMembersByRef: Map<string, SerializedInterfaceMember>,
  interfaceRef: string
) {
  const member = interfaceMembersByRef.get(buildInterfaceMemberKey(interfaceRef, detail.dataElement));
  return {
    ...detail,
    dataType: member?.metadata?.TYPE ?? detail.dataType ?? "-",
    dataConstraints: member?.metadata?.["DATA-CONSTRAINTS"] ?? detail.dataConstraints ?? "-",
    addressingMethod: member?.metadata?.["SW-ADDR-METHOD-REF"] ?? detail.addressingMethod ?? "-",
    useQueuedCommunication: detail.useQueuedCommunication ?? member?.metadata?.["IS-QUEUED"] ?? "-",
    measurementCalibration: member?.metadata?.["SW-CALIBRATION-ACCESS"] ?? detail.measurementCalibration ?? "-",
    handleInvalid: member?.metadata?.["HANDLE-INVALID"] ?? detail.handleInvalid ?? "-"
  };
}

function buildInterfaceMemberKey(interfaceRef: string, dataElementRef: string) {
  return `${normalizeReferencePath(interfaceRef)}::${normalizeReferencePath(dataElementRef)}`;
}

function resolveInterfaceDefinition(
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>,
  typeRef: string
) {
  const exact = interfaceDefinitionsByPath.get(typeRef);
  if (exact) {
    return exact;
  }

  const suffixMatches = Array.from(interfaceDefinitionsByPath.values()).filter(
    (definition) => referencesSameAutosarPath(typeRef, definition.semanticPath)
  );
  return suffixMatches.length === 1 ? suffixMatches[0] : undefined;
}

function resolveInterfaceMember(
  interfaceDefinition: InterfaceDefinition,
  membersByPath: Map<string, InterfaceMember>,
  dataElementRef: string
) {
  const exact = membersByPath.get(dataElementRef);
  if (exact) {
    return exact;
  }

  const suffixMatches = interfaceDefinition.dataElements.filter(
    (member) =>
      (member.semanticPath && referencesSameAutosarPath(dataElementRef, member.semanticPath)) ||
      referencesSameAutosarPath(dataElementRef, `${interfaceDefinition.semanticPath}/${member.label}`)
  );
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  const leafName = getReferenceLeafName(dataElementRef);
  const leafMatches = interfaceDefinition.dataElements.filter((member) => member.label === leafName);
  return leafMatches.length === 1 ? leafMatches[0] : undefined;
}

function referencesSameAutosarPath(left: string, right: string) {
  const leftPath = normalizeReferencePath(left);
  const rightPath = normalizeReferencePath(right);
  return leftPath === rightPath || leftPath.endsWith(`/${rightPath}`) || rightPath.endsWith(`/${leftPath}`);
}

function normalizeReferencePath(value: string) {
  return value.split("/").filter(Boolean).join("/");
}

function parseCommunicationSpecDetails(value: string): CommunicationSpecDetail[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isRecord).map((entry) => entry as unknown as CommunicationSpecDetail) : [];
  } catch {
    return [];
  }
}

function buildConstantValueSpecIndexFromEntities(entities: AutosarEntity[]) {
  const constantValueSpecsByPath = new Map<string, unknown>();
  entities.forEach((entity) => {
    if (entity.type !== "constant" || !entity.semanticPath) {
      return;
    }

    const valueSpecRef = entity.metadata?.["VALUE-SPEC-REF"];
    if (valueSpecRef) {
      constantValueSpecsByPath.set(entity.semanticPath, {
        "CONSTANT-REFERENCE": {
          "CONSTANT-REF": valueSpecRef
        }
      });
      return;
    }

    const valueSpec = entity.metadata?.["VALUE-SPEC"];
    if (valueSpec) {
      constantValueSpecsByPath.set(entity.semanticPath, valueSpec);
    }
  });
  return constantValueSpecsByPath;
}

function resolvePortComSpecValueReferences(
  entities: AutosarEntity[],
  constantValueSpecsByPath: Map<string, unknown>
) {
  if (constantValueSpecsByPath.size === 0) {
    return;
  }

  const resolveConstantReference = (reference: string, visited: Set<string>): string | undefined => {
    const normalizedReference = normalizeReferencePath(reference);
    if (visited.has(normalizedReference)) {
      return undefined;
    }

    const valueSpec = resolveConstantValueSpec(reference, constantValueSpecsByPath);
    if (!valueSpec) {
      return undefined;
    }

    return extractValueSpecificationLabel(valueSpec, resolveConstantReference, new Set([...visited, normalizedReference]));
  };

  entities.forEach((entity) => {
    if (entity.type !== "port" || !entity.metadata?.["COMMUNICATION-SPEC-DETAILS"]) {
      return;
    }

    const details = parseCommunicationSpecDetails(entity.metadata["COMMUNICATION-SPEC-DETAILS"]);
    if (details.length === 0) {
      return;
    }

    const resolvedDetails = details.map((detail) => ({
      ...detail,
      initValue: detail.initValueRef
        ? resolveConstantReference(detail.initValueRef, new Set()) ?? detail.initValue
        : detail.initValue,
      timeoutSubstitutionValue: detail.timeoutSubstitutionValueRef
        ? resolveConstantReference(detail.timeoutSubstitutionValueRef, new Set()) ?? detail.timeoutSubstitutionValue
        : detail.timeoutSubstitutionValue
    }));

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      "COMMUNICATION-SPEC-DETAILS": JSON.stringify(resolvedDetails)
    });
  });
}

function resolveConstantValueSpec(reference: string, constantValueSpecsByPath: Map<string, unknown>) {
  const exact = constantValueSpecsByPath.get(reference);
  if (exact) {
    return exact;
  }

  const normalizedReference = normalizeReferencePath(reference);
  const matches = Array.from(constantValueSpecsByPath.entries()).filter(([path]) =>
    referencesSameAutosarPath(normalizedReference, path)
  );
  const match = matches[0];
  return matches.length === 1 && match ? match[1] : undefined;
}

function attachPortApiOptionsToEntities(
  entities: AutosarEntity[],
  inspectorsByOwner: Map<string, MutableSwcInspector>
) {
  entities.forEach((entity) => {
    if (entity.type !== "port" || !entity.semanticPath || !entity.parentSemanticPath) {
      return;
    }

    const inspector = inspectorsByOwner.get(entity.parentSemanticPath);
    const portApiOptions = inspector?.portApiOptionsByPortRef[entity.semanticPath];
    if (!portApiOptions) {
      return;
    }

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      ...portApiOptions
    });
  });
}

function toSwcInspectorData(entity: AutosarEntity, inspector: MutableSwcInspector): SwcInspectorData {
  return {
    ownerId: entity.id,
    ownerLabel: entity.shortName,
    ownerSemanticPath: inspector.ownerSemanticPath,
    sections: [
      {
        id: "runnables",
        label: "Runnables",
        items: inspector.sections.runnables.map((item) => enrichInspectorItem(item, inspector))
      },
      {
        id: "calibrationVariables",
        label: "Calibration Variables",
        items: inspector.sections.calibrationVariables
      },
      {
        id: "interRunnableVariables",
        label: "Inter-runnable Variables",
        items: inspector.sections.interRunnableVariables.map((item) => enrichInterRunnableVariableItem(item, inspector))
      },
      {
        id: "perInstanceMemory",
        label: "Per-instance Memory",
        items: inspector.sections.perInstanceMemory.map((item) => enrichPerInstanceMemoryItem(item, inspector))
      },
      {
        id: "serviceDependencies",
        label: "Service Needs",
        items: inspector.sections.serviceDependencies.map((item) => enrichServiceDependencyItem(item, inspector))
      },
      {
        id: "interfaceDataElements",
        label: "Interface Data Elements",
        items: inspector.sections.interfaceDataElements
      },
      {
        id: "interfaceOperations",
        label: "Interface Operations",
        items: inspector.sections.interfaceOperations
      },
      {
        id: "interfaceApplicationErrors",
        label: "Interface Errors",
        items: inspector.sections.interfaceApplicationErrors
      },
      {
        id: "interfaceParameters",
        label: "Interface Parameters",
        items: inspector.sections.interfaceParameters
      },
      {
        id: "interfaceModeGroups",
        label: "Interface Mode Groups",
        items: inspector.sections.interfaceModeGroups
      },
      {
        id: "interfaceTriggers",
        label: "Interface Triggers",
        items: inspector.sections.interfaceTriggers
      }
    ]
  };
}

function enrichInspectorItem(item: SwcInspectorItem, inspector: MutableSwcInspector) {
  const triggerEventDetails = inspector.runnableEventDetailsByName[item.label];
  return {
    ...item,
    metadata: compactMetadata({
      PERIOD: inspector.runnablePeriodsByName[item.label],
      "TRIGGER-EVENTS": inspector.runnableEventsByName[item.label]?.join(", "),
      "TRIGGER-EVENT-DETAILS": triggerEventDetails
        ? JSON.stringify(dedupeRunnableTriggerEventDetails(triggerEventDetails))
        : undefined,
      ...(item.metadata ?? {})
    })
  };
}

function enrichInterRunnableVariableItem(item: SwcInspectorItem, inspector: MutableSwcInspector) {
  const accesses = Object.entries(inspector.runnableAccessPointDetailsByName).flatMap(([runnable, details]) =>
    details
      .filter((detail) => detail.target === item.label || referencesSameAutosarPath(detail.target, item.label))
      .map((detail) => ({
        runnable,
        access: detail.access,
        accessPoint: detail.name
      }))
  );

  return {
    ...item,
    metadata: compactMetadata({
      ...(item.metadata ?? {}),
      "INTER-RUNNABLE-VARIABLE-ACCESS": accesses.length > 0 ? JSON.stringify(dedupeInterRunnableAccesses(accesses)) : undefined
    })
  };
}

function enrichPerInstanceMemoryItem(item: SwcInspectorItem, inspector: MutableSwcInspector) {
  const nvmBlockNeed = inspector.nvmBlockNeedsByPimName[item.label];
  return {
    ...item,
    metadata: compactMetadata({
      ...(item.metadata ?? {}),
      "NVM-BLOCK-NEED": item.metadata?.["NVM-BLOCK-NEED"] ?? nvmBlockNeed
    })
  };
}

function enrichServiceDependencyItem(item: SwcInspectorItem, inspector: MutableSwcInspector) {
  const dataDetails = parseServiceAssignedDataDetails(item.metadata?.["ASSIGNED-DATA-DETAILS"]).map((detail) => {
    const interfaceRef = resolvePortInterfaceRef(detail.portPrototypeRef ?? detail.portPrototype, inspector);
    return {
      ...detail,
      portInterface: interfaceRef ? getReferenceLeafName(interfaceRef) : detail.portInterface,
      portInterfaceRef: interfaceRef
    };
  });
  const portDetails = parseServiceAssignedPortDetails(item.metadata?.["ASSIGNED-PORT-DETAILS"]).map((detail) => {
    const interfaceRef = resolvePortInterfaceRef(detail.portPrototypeRef ?? detail.portPrototype, inspector);
    return {
      ...detail,
      portInterface: interfaceRef ? getReferenceLeafName(interfaceRef) : detail.portInterface,
      portInterfaceRef: interfaceRef
    };
  });

  return {
    ...item,
    metadata: compactMetadata({
      ...(item.metadata ?? {}),
      "ASSIGNED-DATA-DETAILS": dataDetails.length > 0 ? JSON.stringify(dataDetails) : undefined,
      "ASSIGNED-PORT-DETAILS": portDetails.length > 0 ? JSON.stringify(portDetails) : undefined
    })
  };
}

function resolvePortInterfaceRef(portReference: string | undefined, inspector: MutableSwcInspector) {
  if (!portReference) {
    return undefined;
  }

  const portName = getReferenceLeafName(portReference);
  const direct = inspector.portInterfacesByName[portName];
  if (direct) {
    return direct;
  }

  const match = Object.entries(inspector.portInterfacesByName).find(([name]) => referencesSameAutosarPath(portReference, name));
  return match?.[1];
}

interface ServiceAssignedPortDetail {
  portPrototype: string;
  portPrototypeRef?: string;
  portInterface: string;
  portInterfaceRef?: string;
  assignedRole: string;
}

interface ServiceAssignedDataDetail {
  role: string;
  value: string;
  portPrototype: string;
  portPrototypeRef?: string;
  portInterface: string;
  portInterfaceRef?: string;
  dataElementPrototype: string;
  dataElementPrototypeRef?: string;
}

function parseServiceAssignedPortDetails(value: string | undefined): ServiceAssignedPortDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      return [
        {
          portPrototype: readSimpleValue(entry.portPrototype) ?? "-",
          portPrototypeRef: readSimpleValue(entry.portPrototypeRef),
          portInterface: readSimpleValue(entry.portInterface) ?? "-",
          portInterfaceRef: readSimpleValue(entry.portInterfaceRef),
          assignedRole: readSimpleValue(entry.assignedRole) ?? "-"
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseServiceAssignedDataDetails(value: string | undefined): ServiceAssignedDataDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      return [
        {
          role: readSimpleValue(entry.role) ?? "-",
          value: readSimpleValue(entry.value) ?? "-",
          portPrototype: readSimpleValue(entry.portPrototype) ?? "-",
          portPrototypeRef: readSimpleValue(entry.portPrototypeRef),
          portInterface: readSimpleValue(entry.portInterface) ?? "-",
          portInterfaceRef: readSimpleValue(entry.portInterfaceRef),
          dataElementPrototype: readSimpleValue(entry.dataElementPrototype) ?? readSimpleValue(entry.value) ?? "-",
          dataElementPrototypeRef: readSimpleValue(entry.dataElementPrototypeRef)
        }
      ];
    });
  } catch {
    return [];
  }
}

function dedupeInterRunnableAccesses(
  accesses: Array<{
    runnable: string;
    access: string;
    accessPoint: string;
  }>
) {
  const seen = new Set<string>();
  return accesses.filter((access) => {
    const key = `${access.runnable}\u0000${access.access}\u0000${access.accessPoint}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function attachInterfaceSections(
  entity: AutosarEntity,
  entities: AutosarEntity[],
  entityBySemanticPath: Map<string, AutosarEntity>,
  interfaceDefinitionsByPath: Map<string, InterfaceDefinition>,
  inspector: MutableSwcInspector,
  validationIssues: ValidationIssue[]
) {
  const ports = entities.filter(
    (candidate) => candidate.type === "port" && candidate.parentSemanticPath === entity.semanticPath
  );

  for (const port of ports) {
    if (!port.typeRef) {
      continue;
    }

    const interfaceEntity = entityBySemanticPath.get(port.typeRef);
    const interfaceDefinition = interfaceDefinitionsByPath.get(port.typeRef);
    const portLabel = `${port.shortName} (${formatPortKind(port.portKind)})`;

    if (!interfaceEntity) {
      validationIssues.push({
        severity: "warning",
        message: `Port ${port.shortName} references unresolved interface ${port.typeRef}.`,
        path: port.xmlPath
      });
      continue;
    }

    if (port.interfaceKind && interfaceEntity.interfaceKind && port.interfaceKind !== interfaceEntity.interfaceKind) {
      validationIssues.push({
        severity: "warning",
        message: `Port ${port.shortName} has mismatched interface metadata for ${interfaceEntity.shortName}.`,
        path: port.xmlPath
      });
    }

    if (
      interfaceEntity.interfaceKind === "parameter" &&
      port.portKind === "provided" &&
      entity.swcKind !== "parameter" &&
      entity.type !== "composition"
    ) {
      validationIssues.push({
        severity: "warning",
        message: `Port ${port.shortName} provides a ParameterInterface from unsupported component kind ${entity.swcKind ?? entity.type}.`,
        path: port.xmlPath
      });
    }

    if (!interfaceDefinition) {
      continue;
    }

    attachInterfaceSectionItems(inspector.sections.interfaceDataElements, interfaceDefinition.dataElements, portLabel, interfaceEntity.shortName);
    attachInterfaceSectionItems(inspector.sections.interfaceOperations, interfaceDefinition.operations, portLabel, interfaceEntity.shortName);
    attachInterfaceSectionItems(
      inspector.sections.interfaceApplicationErrors,
      interfaceDefinition.applicationErrors,
      portLabel,
      interfaceEntity.shortName
    );
    attachInterfaceSectionItems(inspector.sections.interfaceParameters, interfaceDefinition.parameters, portLabel, interfaceEntity.shortName);
    attachInterfaceSectionItems(inspector.sections.interfaceModeGroups, interfaceDefinition.modeGroups, portLabel, interfaceEntity.shortName);
    attachInterfaceSectionItems(inspector.sections.interfaceTriggers, interfaceDefinition.triggers, portLabel, interfaceEntity.shortName);
  }
}

function attachInterfaceSectionItems(
  target: SwcInspectorItem[],
  members: InterfaceMember[],
  portLabel: string,
  interfaceName: string
) {
  members.forEach((member) => {
    target.push({
      id: `${member.id}:${portLabel}`,
      label: member.label,
      xmlPath: member.xmlPath,
      metadata: compactMetadata({
        INTERFACE: interfaceName,
        PORT: portLabel,
        ...(member.metadata ?? {})
      })
    });
  });
}

function extractInitialValue(record: Record<string, unknown>) {
  return (
    extractValueSpecificationLabel(record["INIT-VALUE"]) ??
    extractValueSpecificationLabel(record["DEFAULT-VALUE"]) ??
    findNestedStringValue(record["INIT-VALUE"], ["VALUE", "SHORT-LABEL", "CONSTANT-REF"]) ??
    findNestedStringValue(record["DEFAULT-VALUE"], ["VALUE", "SHORT-LABEL", "CONSTANT-REF"])
  );
}

function extractInitialValueType(record: Record<string, unknown>) {
  return extractValueSpecificationType(record["INIT-VALUE"]) ?? extractValueSpecificationType(record["DEFAULT-VALUE"]);
}

function findNestedStringValue(node: unknown, preferredKeys: string[]): string | undefined {
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findNestedStringValue(entry, preferredKeys);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  const record = node as Record<string, unknown>;
  for (const key of preferredKeys) {
    const found = findNestedStringValue(record[key], preferredKeys);
    if (found) {
      return found;
    }
  }
  for (const value of Object.values(record)) {
    const found = findNestedStringValue(value, preferredKeys);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function getReferenceLeafName(reference: string) {
  const segments = reference.split("/").filter(Boolean);
  return segments.at(-1) ?? reference;
}

function formatPortKind(portKind: PortKind | undefined) {
  if (portKind === "provided-required") {
    return "PR";
  }
  if (portKind === "provided") {
    return "P";
  }
  if (portKind === "required") {
    return "R";
  }
  return "?";
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  return toArray(value).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
}

function collectStructuredFields(
  record: Record<string, unknown>,
  currentPath: string,
  category: string,
  structuredFields: StructuredField[]
) {
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_")) {
      continue;
    }

    if (typeof value === "string") {
      structuredFields.push({
        key,
        value,
        category,
        xmlPath: `${currentPath}/${key}`,
        editable: true
      });
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    value.forEach((entry, index) => {
      if (typeof entry !== "string") {
        return;
      }

      structuredFields.push({
        key,
        value: entry,
        category,
        xmlPath: `${currentPath}/${key}[${index}]`,
        editable: true
      });
    });
  }
}
