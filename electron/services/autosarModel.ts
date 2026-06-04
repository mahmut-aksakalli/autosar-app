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
} from "../../src/shared/contracts.js";
import {
  createAutosarVersionAdapter,
  type AutosarEntityType,
  type AutosarVersionAdapter
} from "./autosarVersionAdapters.js";
import type { ArxmlValidationMetadata } from "../../src/shared/contracts.js";

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
}

interface MutableSwcInspector {
  ownerSemanticPath: string;
  sections: Record<SwcInspectorSectionId, SwcInspectorItem[]>;
  runnablePeriodsByName: Record<string, string>;
  runnableEventsByName: Record<string, string[]>;
  runnableEventDetailsByName: Record<string, RunnableTriggerEventDetail[]>;
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
  xmlPath: string;
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
  const type = adapter.classifyTag(tagName);
  const fieldCategory = type === "generic" ? tagName : type;
  const nextSemanticSegments = shortName ? [...semanticSegments, shortName] : semanticSegments;
  const semanticPath = shortName ? `/${nextSemanticSegments.join("/")}` : undefined;
  const ownerSemanticPath = resolveOwnerSemanticPath(type, semanticPath, currentOwnerSemanticPath);
  const swcKind = type === "swc" || type === "composition" ? adapter.getSwcKind(tagName) : undefined;
  const portKind = type === "port" ? adapter.getPortKind(tagName) : undefined;
  const interfaceKind = type === "interface" ? adapter.getInterfaceKind(tagName) : undefined;
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
      metadata: type === "port" ? collectPortMetadata(record) : collectMetadata(record)
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
    TYPE: extractTypeRef(record),
    "DATA-CONSTRAINTS": extractNestedReference(record, "DATA-CONSTR-REF") ?? extractNestedReference(record, "DATA-CONSTR-TREF"),
    "SW-ADDR-METHOD-REF": extractReference(record, "SW-ADDR-METHOD-REF"),
    "IS-QUEUED": readSimpleValue(record["IS-QUEUED"]) ?? readSimpleValue(record["QUEUE-LENGTH"]),
    "SW-CALIBRATION-ACCESS": findNestedStringValue(record["SW-DATA-DEF-PROPS"], ["SW-CALIBRATION-ACCESS"]),
    "HANDLE-INVALID": findNestedStringValue(record, ["HANDLE-INVALID", "INVALIDATION-POLICY"])
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
    if (runnableRef) {
      const eventName = extractShortName(record) ?? tagName;
      const runnableName = getReferenceLeafName(runnableRef);
      const runnableEvents = (inspector.runnableEventsByName[runnableName] ??= []);
      runnableEvents.push(`${eventName} (${formatAutosarTagLabel(tagName)})`);
      const runnableEventDetails = (inspector.runnableEventDetailsByName[runnableName] ??= []);
      runnableEventDetails.push(collectRunnableTriggerEventDetail(tagName, record, eventName));
    }
  }
  if (tagName === "PORT-API-OPTION") {
    const portRef = extractReference(record, "PORT-REF");
    if (portRef) {
      inspector.portApiOptionsByPortRef[portRef] = collectPortApiOptionMetadata(record);
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
      runnablePeriodsByName: {},
      runnableEventsByName: {},
      runnableEventDetailsByName: {},
      portApiOptionsByPortRef: {}
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

function collectPortMetadata(record: Record<string, unknown>) {
  return compactMetadata({
    DESCRIPTION: extractDescription(record),
    "COMMUNICATION-SPEC-DETAILS": collectCommunicationSpecDetails(record)
  });
}

interface CommunicationSpecDetail {
  index: string;
  dataElement: string;
  comSpec: string;
  initValue: string;
  initValueType: string;
  usesTxAcknowledge: string;
  usesEndToEndProtection: string;
  handleOutOfRange: string;
  transmissionMode: string;
  dataUpdatePeriod: string;
  minimumSendInterval: string;
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
          initValue: extractValueSpecificationLabel(comSpec["INIT-VALUE"]),
          initValueType: extractValueSpecificationType(comSpec["INIT-VALUE"]),
          usesTxAcknowledge: readSimpleValue(comSpec["USES-TX-ACKNOWLEDGE"]) ?? "-",
          usesEndToEndProtection: readSimpleValue(comSpec["USES-END-TO-END-PROTECTION"]) ?? "-",
          handleOutOfRange: readSimpleValue(comSpec["HANDLE-OUT-OF-RANGE"]) ?? "-",
          transmissionMode: findNestedStringValue(comSpec["TRANSMISSION-PROPS"], ["TRANSMISSION-MODE"]) ?? "-",
          dataUpdatePeriod: readSimpleValue(comSpec["DATA-UPDATE-PERIOD"]) ??
            findNestedStringValue(comSpec["TRANSMISSION-PROPS"], ["DATA-UPDATE-PERIOD"]) ??
            "-",
          minimumSendInterval: readSimpleValue(comSpec["MINIMUM-SEND-INTERVAL"]) ??
            findNestedStringValue(comSpec["TRANSMISSION-PROPS"], ["MINIMUM-SEND-INTERVAL"]) ??
            "-"
        });
      }
    }
  };

  collectFromContainer("PROVIDED-COM-SPECS");
  collectFromContainer("REQUIRED-COM-SPECS");

  return details.length > 0 ? JSON.stringify(details) : undefined;
}

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

function extractCommunicationSpecDataElement(record: Record<string, unknown>) {
  return (
    extractNestedReference(record, "DATA-ELEMENT-REF") ??
    extractNestedReference(record, "OPERATION-REF") ??
    extractNestedReference(record, "MODE-GROUP-REF") ??
    "-"
  );
}

function collectPortApiOptionMetadata(record: Record<string, unknown>) {
  return compactMetadata({
    "ENABLE-INDIRECT-API": readSimpleValue(record["INDIRECT-API"]),
    "ENABLE-API-USAGE-BY-ADDRESS": readSimpleValue(record["ENABLE-TAKE-ADDRESS"]),
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

function extractValueSpecificationLabel(value: unknown): string {
  return (
    findNestedStringValue(value, ["VALUE", "SHORT-LABEL", "CONSTANT-REF", "TEXT", "#text"]) ??
    findFirstReferenceValue(value) ??
    readSimpleValue(value) ??
    "-"
  );
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

  return details.length > 0 ? JSON.stringify(dedupeRunnableAccessPointDetails(details)) : undefined;
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

function extractRunnableAccessTarget(record: Record<string, unknown>) {
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
  return firstReference ? getReferenceLeafName(firstReference) : "-";
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
  entities.forEach((entity) => {
    if (entity.type !== "port" || !entity.typeRef || !entity.metadata?.["COMMUNICATION-SPEC-DETAILS"]) {
      return;
    }

    const interfaceDefinition = interfaceDefinitionsByPath.get(entity.typeRef);
    if (!interfaceDefinition) {
      return;
    }

    const details = parseCommunicationSpecDetails(entity.metadata["COMMUNICATION-SPEC-DETAILS"]);
    if (details.length === 0) {
      return;
    }

    const membersByPath = new Map<string, InterfaceMember>();
    interfaceDefinition.dataElements.forEach((member) => {
      if (member.semanticPath) {
        membersByPath.set(member.semanticPath, member);
      }
      membersByPath.set(`${interfaceDefinition.semanticPath}/${member.label}`, member);
      membersByPath.set(member.label, member);
    });

    const enrichedDetails = details.map((detail) => {
      const member = membersByPath.get(detail.dataElement) ?? membersByPath.get(getReferenceLeafName(detail.dataElement));
      return {
        ...detail,
        dataType: member?.metadata?.TYPE ?? "-",
        dataConstraints: member?.metadata?.["DATA-CONSTRAINTS"] ?? "-",
        addressingMethod: member?.metadata?.["SW-ADDR-METHOD-REF"] ?? "-",
        useQueuedCommunication: member?.metadata?.["IS-QUEUED"] ?? "-",
        measurementCalibration: member?.metadata?.["SW-CALIBRATION-ACCESS"] ?? "-",
        handleInvalid: member?.metadata?.["HANDLE-INVALID"] ?? "-"
      };
    });

    entity.metadata = compactMetadata({
      ...(entity.metadata ?? {}),
      "COMMUNICATION-SPEC-DETAILS": JSON.stringify(enrichedDetails)
    });
  });
}

function parseCommunicationSpecDetails(value: string): CommunicationSpecDetail[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isRecord).map((entry) => entry as unknown as CommunicationSpecDetail) : [];
  } catch {
    return [];
  }
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
