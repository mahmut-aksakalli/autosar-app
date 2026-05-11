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
  ValidationIssue
} from "../../src/shared/contracts.js";

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

type EntityType = "swc" | "composition" | "instance" | "port" | "connection" | "interface" | "generic";

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
}

interface MutableSwcInspector {
  ownerSemanticPath: string;
  sections: Record<SwcInspectorSectionId, SwcInspectorItem[]>;
  runnablePeriodsByName: Record<string, string>;
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
  xmlPath: string;
  metadata?: Record<string, string>;
}

export function buildAutosarModel(filePath: string, parsedXml: unknown): ParsedAutosarModel {
  const entries = Object.entries((parsedXml as Record<string, unknown>) ?? {}).filter(
    ([key]) => !key.startsWith("?")
  );
  const [rootTag, rootNode] = entries[0] ?? ["UNKNOWN", {}];
  const entities: AutosarEntity[] = [];
  const connections: PortConnection[] = [];
  const structuredFields: StructuredField[] = [];
  const validationIssues: ValidationIssue[] = [];
  const inspectorsByOwner = new Map<string, MutableSwcInspector>();
  const interfaceDefinitionsByPath = new Map<string, InterfaceDefinition>();

  const shortName = findFirstShortName(rootNode) ?? path.basename(filePath);
  structuredFields.push(
    { key: "SHORT-NAME", value: shortName, category: "Document", editable: false },
    { key: "ROOT-TAG", value: rootTag, category: "Document", editable: false }
  );

  walkNode({
    filePath,
    tagName: rootTag,
    node: rootNode,
    currentPath: `/${rootTag}`,
    semanticSegments: [],
    entities,
    connections,
    structuredFields,
    validationIssues,
    inspectorsByOwner,
    interfaceDefinitionsByPath
  });

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
    interfaceDefinitionsByPath
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
  const type = classifyTag(tagName);
  const fieldCategory = type === "generic" ? tagName : type;
  const nextSemanticSegments = shortName ? [...semanticSegments, shortName] : semanticSegments;
  const semanticPath = shortName ? `/${nextSemanticSegments.join("/")}` : undefined;
  const ownerSemanticPath = resolveOwnerSemanticPath(type, semanticPath, currentOwnerSemanticPath);
  const swcKind = type === "swc" || type === "composition" ? getSwcKind(tagName) : undefined;
  const portKind = type === "port" ? getPortKind(tagName) : undefined;
  const interfaceKind = type === "interface" ? getInterfaceKind(tagName) : undefined;
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
      swcKind,
      portKind,
      portDirection: getPortDirection(tagName),
      mayBeUnconnected: readBooleanValue(record["MAY-BE-UNCONNECTED"]),
      typeRef: extractTypeRef(record),
      interfaceKind,
      metadata: collectMetadata(record)
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
  if (PORT_TAGS.has(tagName) && !extractTypeRef(record)) {
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
      interfaceDefinitionsByPath
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
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      metadata[key] = value[0];
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
    xmlPath: currentPath,
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
  if (tagName === "MODE-DECLARATION-GROUP-PROTOTYPE") {
    definition.modeGroups.push(item);
    return;
  }
  if (tagName === "TRIGGER") {
    definition.triggers.push(item);
  }
}

function collectInterfaceMemberMetadata(tagName: string, record: Record<string, unknown>) {
  if (tagName === "CLIENT-SERVER-OPERATION") {
    const argumentNames = toRecordArray(record["ARGUMENTS"])
      .flatMap((entry) => toRecordArray(entry["ARGUMENT-DATA-PROTOTYPE"]))
      .map((entry) => extractShortName(entry))
      .filter((value): value is string => Boolean(value));
    const errorRefs = toRecordArray(record["POSSIBLE-ERROR-REFS"])
      .flatMap((entry) => toArray(entry["POSSIBLE-ERROR-REF"]))
      .map((entry) => (typeof entry === "string" ? entry : extractReference({ entry }, "entry")))
      .filter((value): value is string => Boolean(value));

    return compactMetadata({
      ARGUMENTS: argumentNames.length > 0 ? argumentNames.join(", ") : undefined,
      ERRORS: errorRefs.length > 0 ? errorRefs.map(getReferenceLeafName).join(", ") : undefined
    });
  }

  if (tagName === "APPLICATION-ERROR") {
    return compactMetadata({
      "ERROR-CODE": readSimpleValue(record["ERROR-CODE"])
    });
  }

  return compactMetadata({
    TYPE: extractTypeRef(record)
  });
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
  if (tagName.endsWith("-EVENT")) {
    const runnableRef = extractReference(record, "START-ON-EVENT-REF");
    const period = readSimpleValue(record["PERIOD"]);
    if (runnableRef && period) {
      inspector.runnablePeriodsByName[getReferenceLeafName(runnableRef)] = period;
    }
  }

  const inspectorSection = getInspectorSectionId(tagName, currentPath);
  const shortName = extractShortName(record);
  if (!inspectorSection || !shortName) {
    return;
  }

  inspector.sections[inspectorSection].push({
    id: `${ownerSemanticPath}:${currentPath}`,
    label: shortName,
    xmlPath: currentPath,
    metadata: collectInspectorMetadata(tagName, record)
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
        interfaceDataElements: [],
        interfaceOperations: [],
        interfaceApplicationErrors: [],
        interfaceParameters: [],
        interfaceModeGroups: [],
        interfaceTriggers: []
      },
      runnablePeriodsByName: {}
    };
    inspectorsByOwner.set(ownerSemanticPath, inspector);
  }
  return inspector;
}

function collectInspectorMetadata(tagName: string, record: Record<string, unknown>) {
  if (tagName === "RUNNABLE-ENTITY") {
    return compactMetadata({
      PERIOD: undefined,
      SYMBOL: readSimpleValue(record["SYMBOL"]),
      "MIN-START-INTERVAL": readSimpleValue(record["MINIMUM-START-INTERVAL"]),
      CONCURRENT: readSimpleValue(record["CAN-BE-INVOKED-CONCURRENTLY"])
    });
  }

  if (tagName === "PARAMETER-DATA-PROTOTYPE" || tagName === "CALPRM-ELEMENT-PROTOTYPE") {
    return compactMetadata({
      TYPE: extractTypeRef(record),
      "INITIAL-VALUE": extractInitialValue(record)
    });
  }

  if (tagName === "PER-INSTANCE-MEMORY") {
    return compactMetadata({
      TYPE: readSimpleValue(record["TYPE"]),
      "TYPE-DEFINITION": readSimpleValue(record["TYPE-DEFINITION"])
    });
  }

  return collectMetadata(record);
}

function compactMetadata(metadata: Record<string, string | undefined>) {
  const entries = Object.entries(metadata).filter(([, value]) => value);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function readSimpleValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  if (Array.isArray(value) && (typeof value[0] === "number" || typeof value[0] === "boolean")) {
    return String(value[0]);
  }
  return undefined;
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
        items: inspector.sections.interRunnableVariables
      },
      {
        id: "perInstanceMemory",
        label: "Per-instance Memory",
        items: inspector.sections.perInstanceMemory
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
  return {
    ...item,
    metadata: compactMetadata({
      PERIOD: inspector.runnablePeriodsByName[item.label],
      ...(item.metadata ?? {})
    })
  };
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
    findNestedStringValue(record["INIT-VALUE"], ["VALUE", "SHORT-LABEL", "CONSTANT-REF"]) ??
    findNestedStringValue(record["DEFAULT-VALUE"], ["VALUE", "SHORT-LABEL", "CONSTANT-REF"])
  );
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
