import type {
  RunnableAccessPointDetail,
  RunnableTriggerEventDetail,
  SwcGraphPort,
  SwcInspectorItem,
  SwcInspectorSectionId
} from "../../../../../../src/shared/contracts";

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

export interface DetailsTableItem {
  sectionId: SwcInspectorSectionId;
  sectionLabel: string;
  item: SwcInspectorItem;
  filePath?: string;
}

export type DetailsTableRow = {
  id: string;
  item: SwcInspectorItem;
  sectionId: SwcInspectorSectionId;
  section: string;
  label: string;
  filePath?: string;
  xmlPath?: string;
} & Record<string, string | SwcInspectorItem | SwcInspectorSectionId | undefined>;

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
