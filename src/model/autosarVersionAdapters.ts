import type {
  ArxmlValidationMetadata,
  PortDirection,
  PortInterfaceKind,
  PortKind,
  SwcKind,
  ValidationScope
} from "../shared/contracts";

export type AutosarEntityType =
  | "swc"
  | "composition"
  | "instance"
  | "port"
  | "connection"
  | "interface"
  | "constant"
  | "application-data-type"
  | "implementation-data-type"
  | "base-type"
  | "unit"
  | "compu-method"
  | "data-constraint"
  | "record-layout"
  | "mode-declaration-group"
  | "type-mapping-set"
  | "addressing-method"
  | "generic";

export interface AutosarExtractionContext {
  profile: "classic";
  adapterId: string;
  autosarRelease?: string;
  autosarVersion?: string;
  namespace?: string;
  schemaFile?: string;
  modelCompleteness: "complete" | "partial" | "external-context";
}

export interface AutosarVersionAdapter {
  readonly context: AutosarExtractionContext;
  classifyTag(tagName: string): AutosarEntityType;
  getSwcKind(tagName: string): SwcKind;
  getPortKind(tagName: string): PortKind | undefined;
  getPortDirection(tagName: string): PortDirection | undefined;
  getInterfaceKind(tagName: string): PortInterfaceKind;
  extractTypeRef(record: Record<string, unknown>): string | undefined;
}

const PORT_TAGS = new Set(["P-PORT-PROTOTYPE", "R-PORT-PROTOTYPE", "PR-PORT-PROTOTYPE"]);
const CONNECTION_TAGS = new Set(["ASSEMBLY-SW-CONNECTOR", "DELEGATION-SW-CONNECTOR"]);
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

export function createAutosarVersionAdapter(input: {
  rootNode: unknown;
  validation?: ArxmlValidationMetadata;
  validationScope: ValidationScope;
}): AutosarVersionAdapter {
  const rootAttributes = readRootAttributes(input.rootNode);
  const namespace = input.validation?.namespace ?? rootAttributes.get("xmlns");
  const schemaLocation = input.validation?.schemaLocation ?? rootAttributes.get("xsi:schemaLocation");
  const inferredVersion = input.validation?.autosarVersion ?? inferAutosarVersion(schemaLocation);
  const inferredRelease = input.validation?.autosarRelease ?? inferAutosarRelease(inferredVersion, input.validation?.schemaFile);
  const modelCompleteness = input.validationScope === "single-file" ? "external-context" : "complete";

  return new ClassicAutosarVersionAdapter({
    profile: "classic",
    adapterId: `classic-${inferredVersion ?? "4.x"}`,
    autosarRelease: inferredRelease,
    autosarVersion: inferredVersion,
    namespace,
    schemaFile: input.validation?.schemaFile,
    modelCompleteness
  });
}

class ClassicAutosarVersionAdapter implements AutosarVersionAdapter {
  constructor(readonly context: AutosarExtractionContext) {}

  classifyTag(tagName: string): AutosarEntityType {
    if (tagName === "SW-COMPONENT-PROTOTYPE") {
      return "instance";
    }
    if (tagName === "COMPOSITION-SW-COMPONENT-TYPE") {
      return "composition";
    }
    if (tagName.endsWith("-SW-COMPONENT-TYPE")) {
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

  getSwcKind(tagName: string): SwcKind {
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

  getPortKind(tagName: string): PortKind | undefined {
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

  getPortDirection(tagName: string): PortDirection | undefined {
    return this.getPortKind(tagName);
  }

  getInterfaceKind(tagName: string): PortInterfaceKind {
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

  extractTypeRef(record: Record<string, unknown>) {
    return (
      extractReference(record, "TYPE-TREF") ??
      extractReference(record, "PROVIDED-INTERFACE-TREF") ??
      extractReference(record, "REQUIRED-INTERFACE-TREF") ??
      extractReference(record, "PROVIDED-REQUIRED-INTERFACE-TREF")
    );
  }
}

function readRootAttributes(rootNode: unknown) {
  const attributes = new Map<string, string>();
  if (!rootNode || typeof rootNode !== "object" || Array.isArray(rootNode)) {
    return attributes;
  }

  Object.entries(rootNode as Record<string, unknown>).forEach(([key, value]) => {
    if (key.startsWith("@_") && typeof value === "string") {
      attributes.set(key.slice(2), value);
    }
  });
  return attributes;
}

function inferAutosarVersion(schemaLocation: string | undefined) {
  if (!schemaLocation) {
    return undefined;
  }

  const autosarDashVersion = /AUTOSAR_(\d+)-(\d+)-(\d+)\.xsd/i.exec(schemaLocation);
  if (autosarDashVersion) {
    return `${Number(autosarDashVersion[1])}.${Number(autosarDashVersion[2])}.${Number(autosarDashVersion[3])}`;
  }

  return undefined;
}

function inferAutosarRelease(version: string | undefined, schemaFile: string | undefined) {
  if (schemaFile) {
    return schemaFile.split(/[\\/]/)[0];
  }
  if (version) {
    return `AUTOSAR ${version}`;
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
