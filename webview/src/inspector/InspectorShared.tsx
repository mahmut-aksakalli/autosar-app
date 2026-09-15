import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type {
  AutosarEntity,
  CommunicationSpecDetail,
  EntityDetailPayload,
  InterfaceDetailMember,
  InterRunnableVariableAccessDetail,
  PortInterfaceKind,
  PortDefinedArgumentValueDetail,
  RunnableAccessPointDetail,
  RunnableActivationReasonDetail,
  RunnableTriggerEventDetail,
  ServiceAssignedDataDetail,
  ServiceAssignedPortDetail,
  ServiceNeedField,
  SwcGraphPort,
  SwcInspectorData,
  SwcInspectorItem,
  SwcInspectorSectionId
} from "../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../tabs/modelWorkspaceTab";

export type SortDirection = "asc" | "desc";
export type RunnableTableColumnKey = "swcName" | "runnableName" | "runnableSymbol" | "period";
export type PortTableColumnKey = "portName" | "direction" | "isServicePort" | "interfaceName" | "interfaceRef";
export type AccessPointTableColumnKey = "target" | "access" | "name";
export type TriggerEventTableColumnKey = "trigger" | "type" | "disabledInModes" | "activationReason" | "name";

export interface RunnableTableRow {
  runnable: SwcInspectorItem;
  swcName: string;
  runnableName: string;
  runnableSymbol: string;
  period: string;
  periodSortValue: number;
}

export interface PortTableRow {
  port: SwcGraphPort;
  portName: string;
  direction: string;
  isServicePort: string;
  interfaceName: string;
  interfaceRef: string;
}

export interface InspectorTableItem {
  sectionId: SwcInspectorSectionId;
  sectionLabel: string;
  item: SwcInspectorItem;
  filePath?: string;
}

export type InspectorTableRow = {
  id: string;
  item: SwcInspectorItem;
  sectionId: SwcInspectorSectionId;
  section: string;
  label: string;
  filePath?: string;
  xmlPath?: string;
} & Record<string, string | SwcInspectorItem | SwcInspectorSectionId | undefined>;

export function SortableTableHeader<Key extends string>(props: {
  label: string;
  columnKey: Key;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key) => void;
}) {
  const { label, columnKey, sort, onSort } = props;
  const isActive = sort.key === columnKey;
  const indicatorClass = isActive ? `is-${sort.direction}` : "is-unsorted";

  return (
    <th scope="col" aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="model-sort-header-button"
        onClick={() => onSort(columnKey)}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={`model-sort-indicator ${indicatorClass}`} aria-hidden="true" />
      </button>
    </th>
  );
}

export function SortableResizableTableHeader<Key extends string>(props: {
  label: string;
  columnKey: Key;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key) => void;
  onResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const { label, columnKey, sort, onSort, onResize } = props;
  const isActive = sort.key === columnKey;
  const indicatorClass = isActive ? `is-${sort.direction}` : "is-unsorted";

  return (
    <th aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="model-sort-header-button"
        onClick={() => onSort(columnKey)}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={`model-sort-indicator ${indicatorClass}`} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="model-runnable-column-resizer"
        aria-label={`Resize ${label} column`}
        onPointerDown={onResize}
      />
    </th>
  );
}

export function compareRunnableRows(
  left: RunnableTableRow,
  right: RunnableTableRow,
  sort: { key: RunnableTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "period") {
    return direction * compareNumbersOrText(left.periodSortValue, right.periodSortValue, left.period, right.period);
  }

  const leftValue = left[sort.key];
  const rightValue = right[sort.key];
  return direction * compareTableText(leftValue, rightValue);
}

export function comparePortRows(
  left: PortTableRow,
  right: PortTableRow,
  sort: { key: PortTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

export function compareAccessPointRows(
  left: RunnableAccessPointDetail,
  right: RunnableAccessPointDetail,
  sort: { key: AccessPointTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

export function compareTriggerEventRows(
  left: RunnableTriggerEventDetail,
  right: RunnableTriggerEventDetail,
  sort: { key: TriggerEventTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

function compareNumbersOrText(leftNumber: number, rightNumber: number, leftText: string, rightText: string) {
  const leftFinite = Number.isFinite(leftNumber);
  const rightFinite = Number.isFinite(rightNumber);
  if (leftFinite && rightFinite) {
    return leftNumber - rightNumber;
  }
  if (leftFinite) {
    return -1;
  }
  if (rightFinite) {
    return 1;
  }
  return compareTableText(leftText, rightText);
}

export function compareTableText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function normalizeTableSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatReferenceShortName(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const parts = value.split("/").filter(Boolean);
  return parts.at(-1) ?? value;
}

export function formatAutosarTagText(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return value
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCalibrationAccess(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const normalized = value.trim().toUpperCase().replace(/[_\s]+/g, "-");
  if (normalized === "READ-WRITE" || normalized === "READWRITE") {
    return "ReadWrite";
  }
  if (normalized === "READ-ONLY" || normalized === "READONLY") {
    return "ReadOnly";
  }
  if (
    normalized === "NOT-ACCESSIBLE" ||
    normalized === "NOTACCESSIBLE" ||
    normalized === "NOT-ACCESSIBLE-NO-AUTOSAR" ||
    normalized === "NOTACCESSIBLENOAUTOSAR"
  ) {
    return "NotAccessible";
  }
  return value;
}

export function formatParameterScopeOption(value: string | undefined): string {
  const normalized = normalizeAutosarEnumToken(value ?? "");
  if (!normalized) {
    return "-";
  }
  if (normalized.includes("perinstance")) {
    return "Per Instance";
  }
  if (normalized.includes("shared")) {
    return "Shared";
  }
  return "-";
}

export function formatInterRunnableCommunicationOption(value: string | undefined): string {
  const normalized = normalizeAutosarEnumToken(value ?? "");
  if (normalized.includes("explicit")) {
    return "Explicit";
  }
  if (normalized.includes("implicit")) {
    return "Implicit";
  }
  return "-";
}

export function ModelCommunicationSpecSubsection(props: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const { title, defaultOpen = false, children } = props;
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <section className="model-list-section model-communication-subsection">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>{title}</span>
      </button>
      {isExpanded && children}
    </section>
  );
}

export function stringifyAccessPointCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

export function formatMeasurementCalibrationOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "notaccessible" || normalized === "none" || normalized === "false") {
    return "Not Accessible";
  }

  if (normalized === "readwrite" || (normalized.includes("read") && normalized.includes("write"))) {
    return "ReadWrite";
  }
  if (normalized === "write" || normalized === "writeonly") {
    return "Write";
  }
  return "Read";
}

export function formatHandleInvalidOption(value: string) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  if (!normalizedValue || normalizedValue === "none" || normalizedValue === "false" || normalizedValue === "noaction") {
    return "None";
  }
  if (normalizedValue.startsWith("replace")) {
    return "Replace";
  }
  if (normalizedValue.startsWith("keep")) {
    return "Keep";
  }
  return "None";
}

export const initValueTypeOptions = [
  "None",
  "Numerical",
  "Textual",
  "Boolean",
  "Constant Reference",
  "Array",
  "Record",
  "Application Value",
  "Not Available"
];

export function formatInitValueTypeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("numerical")) {
    return "Numerical";
  }
  if (normalized.includes("text")) {
    return "Textual";
  }
  if (normalized.includes("boolean")) {
    return "Boolean";
  }
  if (normalized.includes("constant")) {
    return "Constant Reference";
  }
  if (normalized.includes("array")) {
    return "Array";
  }
  if (normalized.includes("record")) {
    return "Record";
  }
  if (normalized.includes("application")) {
    return "Application Value";
  }
  if (normalized.includes("notavailable")) {
    return "Not Available";
  }
  return "None";
}

const INIT_VALUE_PREVIEW_LENGTH = 100;

export function ModelInitValueDisplay(props: { value: string; type: string }) {
  const { value, type } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = shouldTruncateInitValue(value, type);
  const displayValue = formatInitValueDisplay(value, type, isExpanded);
  const isMultiline = displayValue.includes("\n");

  return (
    <span className="model-init-value-display" title={value}>
      <span className={isMultiline ? "model-init-value-text is-multiline" : "model-init-value-text"}>
        {displayValue}
      </span>
      {canExpand && (
        <button
          type="button"
          className="model-init-value-toggle"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}

function formatInitValueDisplay(value: string, type: string, expanded = false) {
  if (expanded) {
    return formatStructuredInitValue(value, type);
  }

  if (!shouldTruncateInitValue(value, type)) {
    return formatStructuredInitValue(value, type);
  }

  return `${value.slice(0, INIT_VALUE_PREVIEW_LENGTH)}...`;
}

function shouldTruncateInitValue(value: string, type: string) {
  const normalizedType = normalizeAutosarEnumToken(type);
  const shouldTruncate =
    normalizedType.includes("constant") ||
    normalizedType.includes("array") ||
    normalizedType.includes("record");

  return shouldTruncate && value.length > INIT_VALUE_PREVIEW_LENGTH;
}

function formatStructuredInitValue(value: string, type: string) {
  const normalizedType = normalizeAutosarEnumToken(type);
  const shouldFormat = normalizedType.includes("array") || normalizedType.includes("record");
  if (!shouldFormat || value === "-" || value.length === 0) {
    return value;
  }

  return prettyPrintCompositeValue(value);
}

function prettyPrintCompositeValue(value: string) {
  let depth = 0;
  let result = "";
  let pendingSpace = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "{" || char === "[") {
      result = trimTrailingSpaces(result);
      if (result.endsWith(":")) {
        result += " ";
      }
      result += char;
      depth += 1;
      result += `\n${"  ".repeat(depth)}`;
      pendingSpace = false;
      continue;
    }
    if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      result = trimTrailingSpaces(result);
      result += `\n${"  ".repeat(depth)}${char}`;
      pendingSpace = false;
      continue;
    }
    if (char === ",") {
      result = trimTrailingSpaces(result) + ",";
      result += `\n${"  ".repeat(depth)}`;
      pendingSpace = false;
      continue;
    }
    if (/\s/.test(char)) {
      pendingSpace = result.length > 0 && !result.endsWith("\n");
      continue;
    }

    if (pendingSpace) {
      result += " ";
      pendingSpace = false;
    }
    result += char;
  }

  return trimTrailingSpaces(result);
}

function trimTrailingSpaces(value: string) {
  return value.replace(/[ \t]+$/g, "");
}

export function normalizeAutosarEnumToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ModelListSection(props: { title: string; items: string[] }) {
  const { title, items } = props;
  return (
    <section className="model-list-section">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="model-list-empty">No items discovered.</div>
      )}
    </section>
  );
}

export function getSectionsForTab(kind: ModelWorkspaceTab["kind"]): SwcInspectorSectionId[] {
  switch (kind) {
    case "runnables":
      return ["runnables"];
    case "parameters":
      return ["calibrationVariables", "interfaceParameters"];
    case "interRunnableVariables":
      return ["interRunnableVariables"];
    case "perInstanceMemory":
    case "perInstanceMemoryItem":
    case "memory":
      return ["perInstanceMemory"];
    case "events":
    case "event":
      return ["interfaceTriggers", "interfaceModeGroups"];
    case "serviceDependencies":
    case "serviceDependencyGroup":
    case "serviceDependency":
      return ["serviceDependencies"];
    case "exclusiveAreas":
      return [];
    default:
      return [
        "runnables",
        "calibrationVariables",
        "interRunnableVariables",
        "perInstanceMemory",
        "serviceDependencies",
        "interfaceDataElements",
        "interfaceOperations",
        "interfaceApplicationErrors",
        "interfaceParameters",
        "interfaceModeGroups",
        "interfaceTriggers"
      ];
  }
}

export function getSemanticColumns(kind: ModelWorkspaceTab["kind"]) {
  if (kind === "parameters") {
    return [
      { key: "section", label: "Source" },
      { key: "label", label: "Parameter" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" },
      { key: "TYPE", label: "Type" }
    ];
  }

  if (kind === "events" || kind === "event") {
    return [
      { key: "section", label: "Source" },
      { key: "label", label: "Event" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" }
    ];
  }

  if (kind === "serviceDependencies" || kind === "serviceDependencyGroup" || kind === "serviceDependency") {
    return [
      { key: "label", label: "Name" },
      { key: "SERVICE-TYPE", label: "Service Type" },
      { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
    ];
  }

  return [
    { key: "section", label: "Section" },
    { key: "label", label: "Name" },
    { key: "TYPE", label: "Type" },
    { key: "SYMBOL", label: "Symbol" },
    { key: "PERIOD", label: "Period" }
  ];
}

export function getEmptyLabel(kind: ModelWorkspaceTab["kind"]) {
  switch (kind) {
    case "events":
      return "No events discovered.";
    case "parameters":
      return "No parameters discovered.";
    case "perInstanceMemory":
      return "No per-instance memory discovered.";
    case "exclusiveAreas":
      return "No exclusive areas discovered.";
    case "serviceDependencies":
    case "serviceDependencyGroup":
      return "No service needs discovered.";
    default:
      return "No semantic details discovered.";
  }
}

export function findInspectorItem(
  inspector: SwcInspectorData | undefined,
  sectionId: SwcInspectorSectionId,
  itemId: string | undefined
) {
  return inspector?.sections.find((section) => section.id === sectionId)?.items.find((item) => item.id === itemId);
}

export function findInspectorItemInSections(
  inspector: SwcInspectorData | undefined,
  sectionIds: SwcInspectorSectionId[],
  itemId: string | undefined
) {
  if (!itemId) {
    return undefined;
  }

  for (const sectionId of sectionIds) {
    const item = findInspectorItem(inspector, sectionId, itemId);
    if (item) {
      return item;
    }
  }

  return undefined;
}

export function collectInspectorItems(
  inspector: SwcInspectorData | undefined,
  sectionIds: SwcInspectorSectionId[]
): InspectorTableItem[] {
  return sectionIds.flatMap((sectionId) => {
    const section = inspector?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({
      sectionId,
      sectionLabel: section?.label ?? sectionId,
      item
    }));
  });
}

function inspectorItemRows(item: SwcInspectorItem | undefined, sectionLabel?: string): Array<[string, string]> {
  if (!item) {
    return [["Name", "-"]];
  }

  return [
    ["Name", item.label],
    ...(sectionLabel ? ([["Source", sectionLabel]] as Array<[string, string]>) : []),
    ...Object.entries(item.metadata ?? {}).map(([key, value]) => [key, value] as [string, string])
  ];
}

export function readBooleanMetadata(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
}

export function formatBooleanMetadata(value: string | undefined) {
  return readBooleanMetadata(value) === true ? "true" : "false";
}

export function readEnabledMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "-" && normalized !== "false" && normalized !== "none" && normalized !== "no";
}

export function readTransformationErrorHandlingMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "-" &&
    normalized !== "false" &&
    normalized !== "none" &&
    normalized !== "no" &&
    normalized !== "no-transformer-error-handling"
  );
}

export function splitMetadataList(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export function formatTimeInterval(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  if (seconds === 0 || Math.abs(seconds) >= 1) {
    return `${formatNumber(seconds)} sec`;
  }

  const milliseconds = seconds * 1000;
  if (Math.abs(milliseconds) >= 1) {
    return `${formatNumber(milliseconds)} msec`;
  }

  return `${formatNumber(seconds * 1_000_000)} usec`;
}

export function formatOptionalMilliseconds(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  return `${formatNumber(seconds * 1000)} ms`;
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}
