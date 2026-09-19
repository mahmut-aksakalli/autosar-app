import type {
  CommunicationSpecDetail,
  InterfaceDetailMember,
  PortDefinedArgumentValueDetail,
  PortInterfaceKind,
  SwcGraphPort
} from "../../../../../../src/shared/contracts";
import { normalizeAutosarEnumToken, stringifyAccessPointCell } from "../../../Common/Details/DetailsFormatters";

export function formatPortDirectionLabel(direction: SwcGraphPort["direction"] | undefined, interfaceKind?: PortInterfaceKind) {
  if (interfaceKind === "client-server") {
    if (direction === "provided") {
      return "Server";
    }
    if (direction === "required") {
      return "Client";
    }
    return "Client/Server";
  }
  if (interfaceKind === "parameter") {
    if (direction === "provided") {
      return "Parameter Provider";
    }
    if (direction === "required") {
      return "Parameter Consumer";
    }
    return "Parameter Provider/Consumer";
  }
  if (interfaceKind === "mode-switch") {
    if (direction === "provided") {
      return "Mode Manager";
    }
    if (direction === "required") {
      return "Mode User";
    }
    return "Mode Manager/User";
  }
  if (interfaceKind === "trigger") {
    if (direction === "provided") {
      return "Trigger Provider";
    }
    if (direction === "required") {
      return "Trigger Consumer";
    }
    return "Trigger Provider/Consumer";
  }
  if (interfaceKind === "nv-data") {
    if (direction === "provided") {
      return "Nv Data Provider";
    }
    if (direction === "required") {
      return "Nv Data Consumer";
    }
    return "Nv Data Provider/Consumer";
  }
  if (direction === "provided") {
    return "Sender";
  }
  if (direction === "required") {
    return "Receiver";
  }
  return "Sender/Receiver";
}

export function getPortDirectionOptions(interfaceKind: PortInterfaceKind) {
  if (interfaceKind === "client-server") {
    return ["Server", "Client", "Client/Server"];
  }
  if (interfaceKind === "parameter") {
    return ["Parameter Provider", "Parameter Consumer", "Parameter Provider/Consumer"];
  }
  if (interfaceKind === "mode-switch") {
    return ["Mode Manager", "Mode User", "Mode Manager/User"];
  }
  if (interfaceKind === "trigger") {
    return ["Trigger Provider", "Trigger Consumer", "Trigger Provider/Consumer"];
  }
  if (interfaceKind === "nv-data") {
    return ["Nv Data Provider", "Nv Data Consumer", "Nv Data Provider/Consumer"];
  }
  return ["Sender", "Receiver", "Sender/Receiver"];
}

export function formatPortInterfaceKindLabel(interfaceKind: PortInterfaceKind | undefined) {
  if (interfaceKind === "sender-receiver") {
    return "SenderReceiverInterface";
  }
  if (interfaceKind === "client-server") {
    return "ClientServerInterface";
  }
  if (interfaceKind === "mode-switch") {
    return "ModeSwitchInterface";
  }
  if (interfaceKind === "nv-data") {
    return "NvDataInterface";
  }
  if (interfaceKind === "parameter") {
    return "ParameterInterface";
  }
  if (interfaceKind === "trigger") {
    return "TriggerInterface";
  }
  return "Unknown";
}

export function getCommunicationSpecItemLabel(interfaceKind: PortInterfaceKind) {
  if (interfaceKind === "client-server") {
    return "Operation";
  }
  if (interfaceKind === "parameter") {
    return "Parameter";
  }
  if (interfaceKind === "nv-data") {
    return "Nv Data";
  }
  if (interfaceKind === "mode-switch") {
    return "Mode Group";
  }
  if (interfaceKind === "trigger") {
    return "Trigger";
  }
  return "Data Element";
}

export function formatCommunicationSpecDirectionLabel(direction: string) {
  if (direction === "client") {
    return "Client";
  }
  if (direction === "server") {
    return "Server";
  }
  if (direction === "parameter") {
    return "Parameter";
  }
  if (direction === "nvData") {
    return "Nv Data";
  }
  if (direction === "mode") {
    return "Mode";
  }
  if (direction === "trigger") {
    return "Trigger";
  }
  return "Generic";
}

export function normalizePortDefinedArgumentValues(values: PortDefinedArgumentValueDetail[]) {
  return values.map((value) => ({
    index: stringifyAccessPointCell(value.index),
    name: stringifyAccessPointCell(value.name),
    dataType: stringifyAccessPointCell(value.dataType),
    value: stringifyAccessPointCell(value.value)
  }));
}

export function normalizeCommunicationSpecDetails(values: CommunicationSpecDetail[]) {
  return values.map((record) => ({
    index: stringifyAccessPointCell(record.index),
    dataElement: stringifyAccessPointCell(record.dataElement),
    comSpec: stringifyAccessPointCell(record.comSpec),
    comSpecDirection: parseCommunicationSpecDirection(record.comSpecDirection, record.comSpec),
    initValue: stringifyAccessPointCell(record.initValue),
    initValueType: stringifyAccessPointCell(record.initValueType),
    ...(record.initValueRef ? { initValueRef: stringifyAccessPointCell(record.initValueRef) } : {}),
    usesTxAcknowledge: stringifyAccessPointCell(record.usesTxAcknowledge),
    transmissionAcknowledgeTimeout: stringifyAccessPointCell(record.transmissionAcknowledgeTimeout),
    usesEndToEndProtection: stringifyAccessPointCell(record.usesEndToEndProtection),
    handleOutOfRange: stringifyAccessPointCell(record.handleOutOfRange),
    transmissionMode: stringifyAccessPointCell(record.transmissionMode),
    dataUpdatePeriod: stringifyAccessPointCell(record.dataUpdatePeriod),
    minimumSendInterval: stringifyAccessPointCell(record.minimumSendInterval),
    aliveTimeout: stringifyAccessPointCell(record.aliveTimeout),
    enableUpdate: stringifyAccessPointCell(record.enableUpdate),
    handleNeverReceived: stringifyAccessPointCell(record.handleNeverReceived),
    usesEndToEndProtectionErrorHandling: stringifyAccessPointCell(record.usesEndToEndProtectionErrorHandling),
    timeoutSubstitutionValue: stringifyAccessPointCell(record.timeoutSubstitutionValue),
    timeoutSubstitutionValueType: stringifyAccessPointCell(record.timeoutSubstitutionValueType),
    handleTimeoutType: stringifyAccessPointCell(record.handleTimeoutType),
    rxFilter: stringifyAccessPointCell(record.rxFilter),
    handleDataStatus: stringifyAccessPointCell(record.handleDataStatus),
    queueLength: stringifyAccessPointCell(record.queueLength),
    dataType: stringifyAccessPointCell(record.dataType),
    dataConstraints: stringifyAccessPointCell(record.dataConstraints),
    addressingMethod: stringifyAccessPointCell(record.addressingMethod),
    useQueuedCommunication: stringifyAccessPointCell(record.useQueuedCommunication),
    measurementCalibration: stringifyAccessPointCell(record.measurementCalibration),
    handleInvalid: stringifyAccessPointCell(record.handleInvalid)
  }));
}

export function mapInterfaceMemberDetails(members: InterfaceDetailMember[]): CommunicationSpecDetail[] {
  return members.map((member, index) => {
      const metadata = member.metadata ?? {};
      const semanticPath = stringifyAccessPointCell(member.semanticPath);
      const label = stringifyAccessPointCell(member.label);
      return {
          index: String(index + 1),
          dataElement: semanticPath !== "-" ? semanticPath : label,
          comSpec: stringifyAccessPointCell(member.kind),
          comSpecDirection: parseCommunicationSpecDirection(member.kind, member.kind),
          initValue: stringifyAccessPointCell(metadata["INITIAL-VALUE"] ?? metadata["INIT-VALUE"]),
          initValueType: stringifyAccessPointCell(metadata["INITIAL-VALUE-TYPE"] ?? metadata["INIT-VALUE-TYPE"]),
          usesTxAcknowledge: "-",
          transmissionAcknowledgeTimeout: "-",
          usesEndToEndProtection: "-",
          handleOutOfRange: "-",
          transmissionMode: "-",
          dataUpdatePeriod: "-",
          minimumSendInterval: "-",
          aliveTimeout: "-",
          enableUpdate: "-",
          handleNeverReceived: "-",
          usesEndToEndProtectionErrorHandling: "-",
          timeoutSubstitutionValue: "-",
          timeoutSubstitutionValueType: "-",
          handleTimeoutType: "-",
          rxFilter: "-",
          handleDataStatus: "-",
          queueLength: "-",
          dataType: stringifyAccessPointCell(metadata.TYPE),
          dataConstraints: stringifyAccessPointCell(metadata["DATA-CONSTRAINTS"]),
          addressingMethod: stringifyAccessPointCell(metadata["SW-ADDR-METHOD-REF"]),
          useQueuedCommunication: stringifyAccessPointCell(metadata["IS-QUEUED"]),
          measurementCalibration: stringifyAccessPointCell(metadata["SW-CALIBRATION-ACCESS"]),
          handleInvalid: stringifyAccessPointCell(metadata["HANDLE-INVALID"])
      };
  });
}

function parseCommunicationSpecDirection(direction: unknown, comSpec: unknown) {
  const rawDirection = stringifyAccessPointCell(direction).toLowerCase();
  if (
    rawDirection === "sender" ||
    rawDirection === "receiver" ||
    rawDirection === "client" ||
    rawDirection === "server" ||
    rawDirection === "parameter" ||
    rawDirection === "mode" ||
    rawDirection === "trigger" ||
    rawDirection === "nvdata"
  ) {
    return rawDirection === "nvdata" ? "nvData" : rawDirection;
  }

  const rawComSpec = stringifyAccessPointCell(comSpec).toLowerCase();
  if (rawComSpec.includes("receiver")) {
    return "receiver";
  }
  if (rawComSpec.includes("sender")) {
    return "sender";
  }
  if (rawComSpec.includes("client")) {
    return "client";
  }
  if (rawComSpec.includes("server")) {
    return "server";
  }
  if (rawComSpec.includes("parameter")) {
    return "parameter";
  }
  if (rawComSpec.includes("nvdata") || rawComSpec.includes("nv data")) {
    return "nvData";
  }
  if (rawComSpec.includes("mode")) {
    return "mode";
  }
  if (rawComSpec.includes("trigger")) {
    return "trigger";
  }
  return "unknown";
}

export const handleOutOfRangeOptions = ["None", "Ignore", "Saturate", "Wrap", "Replace", "Invalidate"];

export const transmissionModeOptions = [
  "None",
  "Cyclic",
  "On Change",
  "On Write",
  "Triggered",
  "Triggered On Change",
  "Triggered On Change Without Repetition",
  "Triggered Without Repetition"
];

const rxFilterOptions = [
  "None",
  "ALWAYS",
  "NEVER",
  "MASKED-NEW-DIFFERS-X",
  "MASKED-NEW-DIFFERS-MASKED-OLD",
  "MASKED-NEW-EQUALS-X",
  "MASKED-NEW-EQUALS-MASKED-OLD",
  "NEW-IS-WITHIN",
  "NEW-IS-OUTSIDE",
  "ONE-EVERY-N"
];

export function getRxFilterOptions(value: string) {
  const option = formatRxFilterOption(value);
  return rxFilterOptions.includes(option) ? rxFilterOptions : [...rxFilterOptions, option];
}

export function formatRxFilterOption(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return "None";
  }

  const labeledMatch = trimmed.match(/(?:^|,\s*)Data Filter Type:\s*([^,]+)/i);
  return (labeledMatch?.[1] ?? trimmed).trim();
}

export function formatHandleOutOfRangeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "false" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("ignore")) {
    return "Ignore";
  }
  if (normalized.includes("saturate")) {
    return "Saturate";
  }
  if (normalized.includes("wrap")) {
    return "Wrap";
  }
  if (normalized.includes("replace")) {
    return "Replace";
  }
  if (normalized.includes("invalidate") || normalized.includes("invalid")) {
    return "Invalidate";
  }
  return "None";
}

export function formatTransmissionModeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "false" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("triggeredonchangewithoutrepetition")) {
    return "Triggered On Change Without Repetition";
  }
  if (normalized.includes("triggeredwithoutrepetition")) {
    return "Triggered Without Repetition";
  }
  if (normalized.includes("triggeredonchange")) {
    return "Triggered On Change";
  }
  if (normalized.includes("triggered")) {
    return "Triggered";
  }
  if (normalized.includes("onchange")) {
    return "On Change";
  }
  if (normalized.includes("onwrite")) {
    return "On Write";
  }
  if (normalized.includes("cyclic")) {
    return "Cyclic";
  }
  return "None";
}
