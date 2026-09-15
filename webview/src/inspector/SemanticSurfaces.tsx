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
type AccessPointTableColumnKey = "target" | "access" | "name";
type TriggerEventTableColumnKey = "trigger" | "type" | "disabledInModes" | "activationReason" | "name";

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

function SortableResizableTableHeader<Key extends string>(props: {
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

function compareAccessPointRows(
  left: RunnableAccessPointDetail,
  right: RunnableAccessPointDetail,
  sort: { key: AccessPointTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

function compareTriggerEventRows(
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

export function ModelRunnableSurface(props: {
  title: string;
  runnable?: SwcInspectorItem;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, runnable } = props;
  const concurrent = readBooleanMetadata(runnable?.metadata?.CONCURRENT);
  const activationReasonDetails = runnable?.details?.activationReasons ?? [];
  const accessPoints = splitMetadataList(runnable?.metadata?.["ACCESS-POINTS"]);
  const accessPointDetails = runnable?.details?.accessPoints ?? [];
  const triggerEvents = splitMetadataList(runnable?.metadata?.["TRIGGER-EVENTS"]);
  const triggerEventDetails = runnable?.details?.triggerEvents ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-runnable-detail">
        <div className="model-semantic-kv model-runnable-fields">
          <div>
            <span>Name</span>
            <strong>{runnable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Symbol</span>
            <strong>{runnable?.metadata?.SYMBOL ?? "-"}</strong>
          </div>
          <div>
            <span>Can Be Invoked Concurrently</span>
            <strong>
              <input type="checkbox" checked={concurrent === true} disabled readOnly />
            </strong>
          </div>
          <div>
            <span>Minimum Start Interval</span>
            <strong>{formatTimeInterval(runnable?.metadata?.["MIN-START-INTERVAL"])}</strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{runnable?.metadata?.["SW-ADDR-METHOD-REF"] ?? "-"}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{runnable?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>
        <ModelRunnableTriggerEventsTable details={triggerEventDetails} fallbackItems={triggerEvents} />
        <ModelRunnableAccessPointsTable details={accessPointDetails} fallbackItems={accessPoints} />
        <ModelRunnableActivationReasonsTable details={activationReasonDetails} />
      </div>
    </div>
  );
}

export function ModelPortSurface(props: {
  title: string;
  port?: SwcGraphPort;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, port } = props;
  const argumentValues = normalizePortDefinedArgumentValues(port?.details?.portDefinedArgumentValues ?? []);
  const communicationSpecs = normalizeCommunicationSpecDetails(port?.details?.communicationSpecs ?? []);
  const interfaceMemberDetails = mapInterfaceMemberDetails(port?.details?.interfaceMembers ?? []);
  const displayedSpecs = communicationSpecs.length > 0 ? communicationSpecs : interfaceMemberDetails;
  const specsTitle = communicationSpecs.length > 0 ? "Communication Specs" : "Interface Members";
  const interfaceKind = port?.interfaceKind ?? "unknown";
  const directionOptions = getPortDirectionOptions(interfaceKind);
  const directionLabel = formatPortDirectionLabel(port?.direction, interfaceKind);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{port?.label ?? title.replace(/^Port:\s*/, "")}</strong>
          </div>
          <div>
            <span>Port Interface</span>
            <strong>{formatReferenceShortName(port?.interfaceRef)}</strong>
          </div>
          <div>
            <span>Port Interface Type</span>
            <strong>{formatPortInterfaceKindLabel(interfaceKind)}</strong>
          </div>
          <div>
            <span>Direction</span>
            <strong>
              <select value={directionLabel} disabled>
                {directionOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </strong>
          </div>
          <div>
            <span>Is Service Port</span>
            <strong>{formatBooleanMetadata(port?.metadata?.["IS-SERVICE"])}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{port?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>

        <ModelPortApiOptionsSection port={port} argumentValues={argumentValues} />
        <ModelCommunicationSpecsSection rows={displayedSpecs} interfaceKind={interfaceKind} title={specsTitle} />
      </div>
    </div>
  );
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

function getPortDirectionOptions(interfaceKind: PortInterfaceKind) {
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

function formatPortInterfaceKindLabel(interfaceKind: PortInterfaceKind | undefined) {
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

function getCommunicationSpecItemLabel(interfaceKind: PortInterfaceKind) {
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

function formatCommunicationSpecDirectionLabel(direction: string) {
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

function ModelPortApiOptionsSection(props: {
  port?: SwcGraphPort;
  argumentValues: PortDefinedArgumentValueDetail[];
}) {
  const { port, argumentValues } = props;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="model-list-section model-port-api-section">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>Port API Options</span>
      </button>
      {isExpanded && (
        <>
          <div className="model-semantic-kv model-port-fields">
            <div>
              <span>Enable indirect API</span>
              <strong>
                <input
                  type="checkbox"
                  checked={readBooleanMetadata(port?.metadata?.["ENABLE-INDIRECT-API"]) === true}
                  disabled
                  readOnly
                />
              </strong>
            </div>
            <div>
              <span>Enable API usage by address</span>
              <strong>
                <input
                  type="checkbox"
                  checked={readBooleanMetadata(port?.metadata?.["ENABLE-API-USAGE-BY-ADDRESS"]) === true}
                  disabled
                  readOnly
                />
              </strong>
            </div>
            <div>
              <span>Transformation Error Handling</span>
              <strong>
                <input
                  type="checkbox"
                  checked={readTransformationErrorHandlingMetadata(port?.metadata?.["TRANSFORMATION-ERROR-HANDLING"])}
                  disabled
                  readOnly
                />
              </strong>
            </div>
          </div>
          <ModelPortDefinedArgumentTable rows={argumentValues} />
        </>
      )}
    </section>
  );
}

function ModelCommunicationSpecsSection(props: {
  rows: CommunicationSpecDetail[];
  interfaceKind: PortInterfaceKind;
  title?: string;
}) {
  const { rows, interfaceKind, title = "Communication Specs" } = props;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="model-list-section model-port-comspec-section">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>{title}</span>
        <span className="model-list-section-count">{rows.length}</span>
      </button>
      {isExpanded && <ModelCommunicationSpecsTable rows={rows} interfaceKind={interfaceKind} embedded />}
    </section>
  );
}

function ModelPortDefinedArgumentTable(props: { rows: PortDefinedArgumentValueDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Port defined argument values</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>Index</th>
                <th>Name</th>
                <th>Data type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.index}:${row.name}:${row.dataType}:${row.value}`}>
                  <td title={row.index}>{row.index}</td>
                  <td title={row.name}>{row.name}</td>
                  <td title={row.dataType}>{row.dataType}</td>
                  <td title={row.value}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No port defined argument values discovered.</div>
      )}
    </section>
  );
}

function ModelCommunicationSpecsTable(props: {
  rows: CommunicationSpecDetail[];
  interfaceKind: PortInterfaceKind;
  embedded?: boolean;
}) {
  const { rows, interfaceKind, embedded } = props;
  const itemLabel = getCommunicationSpecItemLabel(interfaceKind);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    rows[0] ? getCommunicationSpecRowKey(rows[0]) : undefined
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedRow = rows.find((row) => getCommunicationSpecRowKey(row) === selectedKey) ?? rows[0];

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) {
      return;
    }

    let frameId = 0;
    const updateHeight = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const availableHeight = window.innerHeight - tableWrap.getBoundingClientRect().top - 12;
        setTableViewportHeight(Math.max(260, availableHeight));
      });
    };
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(document.body);
    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, true);
    updateHeight();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("scroll", updateHeight, true);
    };
  }, [embedded, rows.length]);

  return (
    <section className={embedded ? "model-port-comspec-table-section" : "model-list-section model-port-comspec-section"}>
      {!embedded && <h3>Communication Specs</h3>}
      {rows.length > 0 ? (
        <div className="model-comspec-master-detail">
          <div
            ref={tableWrapRef}
            className="model-runnable-table-scroll model-comspec-table-wrap"
            style={tableViewportHeight ? { height: `${tableViewportHeight}px` } : undefined}
          >
            <table className="model-runnable-table">
              <thead>
                <tr>
                  <th style={{ width: "70px" }}>Index</th>
                  <th>{itemLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowKey = getCommunicationSpecRowKey(row);
                  const isSelected = selectedRow ? rowKey === getCommunicationSpecRowKey(selectedRow) : false;
                  return (
                    <tr key={rowKey} className={isSelected ? "is-selected" : undefined}>
                      <td title={row.index}>{row.index}</td>
                      <td title={row.dataElement}>
                        <button
                          type="button"
                          className="model-table-cell-button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedKey(rowKey)}
                        >
                          {formatReferenceShortName(row.dataElement)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="model-comspec-detail-panel" aria-label={`${itemLabel} details`}>
            {selectedRow ? (
              <>
                <div className="model-comspec-detail-heading">
                  <span>{itemLabel}</span>
                  <strong title={selectedRow.dataElement}>{formatReferenceShortName(selectedRow.dataElement)}</strong>
                </div>
                <ModelCommunicationSpecDetails row={selectedRow} itemLabel={itemLabel} />
              </>
            ) : (
              <div className="model-list-empty">Select a communication spec.</div>
            )}
          </aside>
        </div>
      ) : (
        <div className="model-list-empty">No communication specs discovered.</div>
      )}
    </section>
  );
}

function getCommunicationSpecRowKey(row: CommunicationSpecDetail) {
  return `${row.index}:${row.dataElement}:${row.comSpec}:${row.initValue}`;
}

function ModelCommunicationSpecDetails(props: { row: CommunicationSpecDetail; itemLabel: string }) {
  const { row, itemLabel } = props;
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title={`${itemLabel} Properties`} defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(row.dataType)}</strong>
          </div>
          <div>
            <span>Data Constraints</span>
            <strong>{formatReferenceShortName(row.dataConstraints)}</strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(row.addressingMethod)}</strong>
          </div>
          <div>
            <span>Use queued communication</span>
            <strong>
              <input type="checkbox" checked={readBooleanMetadata(row.useQueuedCommunication) === true} disabled readOnly />
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(row.measurementCalibration)} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong>
              <select value={formatHandleInvalidOption(row.handleInvalid)} disabled>
                <option>Keep</option>
                <option>Replace</option>
                <option>None</option>
              </select>
            </strong>
          </div>
        </div>
      </ModelCommunicationSpecSubsection>

      {row.comSpecDirection === "sender" && <ModelSenderComSpecDetails row={row} />}
      {row.comSpecDirection === "receiver" && <ModelReceiverComSpecDetails row={row} />}
      {row.comSpecDirection !== "sender" && row.comSpecDirection !== "receiver" && (
        <ModelGenericComSpecDetails row={row} />
      )}
    </div>
  );
}

function ModelSenderComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <ModelCommunicationSpecSubsection title="Sender ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ModelInitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div className="model-semantic-kv-three">
          <span>Uses Tx Acknowledge</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.usesTxAcknowledge) === true} disabled readOnly />
          </strong>
          <strong className="model-inline-value-with-label">
            <small>Timeout (ms)</small>
            {formatOptionalMilliseconds(row.transmissionAcknowledgeTimeout)}
          </strong>
        </div>
        <div>
          <span>Uses End-to-End Protection</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.usesEndToEndProtection) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Handle Out of Range</span>
          <strong>
            <select value={formatHandleOutOfRangeOption(row.handleOutOfRange)} disabled>
              {handleOutOfRangeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
      </div>
      <section className="model-port-argument-section">
        <h3>Use Transmission Props</h3>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Transmission Mode</span>
            <strong>
              <select value={formatTransmissionModeOption(row.transmissionMode)} disabled>
                {transmissionModeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </strong>
          </div>
          <div>
            <span>Data Update Period</span>
            <strong>{formatOptionalMilliseconds(row.dataUpdatePeriod)}</strong>
          </div>
          <div>
            <span>Minimum Send Interval</span>
            <strong>{formatOptionalMilliseconds(row.minimumSendInterval)}</strong>
          </div>
        </div>
      </section>
    </ModelCommunicationSpecSubsection>
  );
}

function ModelReceiverComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <ModelCommunicationSpecSubsection title="Receiver ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ModelInitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div>
          <span>Rx Filter</span>
          <strong>
            <select value={formatRxFilterOption(row.rxFilter)} disabled>
              {getRxFilterOptions(row.rxFilter).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
        <div>
          <span>Uses End-to-End Protection</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.usesEndToEndProtection) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Handle Never Received</span>
          <strong>
            <input type="checkbox" checked={readEnabledMetadata(row.handleNeverReceived)} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Enable Update</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.enableUpdate) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Alive Timeout</span>
          <strong>{formatOptionalMilliseconds(row.aliveTimeout)}</strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{row.queueLength}</strong>
        </div>
        <div>
          <span>Handle Out Of Range</span>
          <strong>
            <select value={formatHandleOutOfRangeOption(row.handleOutOfRange)} disabled>
              {handleOutOfRangeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
      </div>
    </ModelCommunicationSpecSubsection>
  );
}

function ModelGenericComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <ModelCommunicationSpecSubsection title={`${formatCommunicationSpecDirectionLabel(row.comSpecDirection)} ComSpec`} defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ModelInitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{row.queueLength}</strong>
        </div>
      </div>
    </ModelCommunicationSpecSubsection>
  );
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

function ModelRunnableActivationReasonsTable(props: { details: RunnableActivationReasonDetail[] }) {
  const { details } = props;

  return (
    <section className="model-list-section model-activation-reasons-section">
      <h3>Activation Reasons</h3>
      {details.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th style={{ width: "90px" }}>Bit</th>
                <th>Name</th>
                <th>Symbol</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row, index) => (
                <tr key={`${row.bit}:${row.name}:${row.symbol}:${index}`}>
                  <td title={row.bit}>{row.bit}</td>
                  <td title={row.name}>{row.name}</td>
                  <td title={row.symbol}>{row.symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No activation reasons discovered.</div>
      )}
    </section>
  );
}

function ModelRunnableAccessPointsTable(props: { details: RunnableAccessPointDetail[]; fallbackItems: string[] }) {
  const { details, fallbackItems } = props;
  const [columnWidths, setColumnWidths] = useState([280, 180, 260]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: AccessPointTableColumnKey; direction: SortDirection }>({
    key: "target",
    direction: "asc"
  });
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          target: "-",
          access: "-",
          name: item
        }));
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.target, row.access, row.name].some((value) => normalizeTableSearch(value).includes(normalizedQuery))
          : true
      )
      .sort((left, right) => compareAccessPointRows(left, right, sort));
  }, [rows, searchQuery, sort]);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const changeSort = (key: AccessPointTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex] ?? 180;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((currentWidths) =>
        currentWidths.map((width, index) => (index === columnIndex ? Math.max(120, startWidth + delta) : width))
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <section className="model-list-section model-access-points-section">
      <div className="model-list-section-header">
        <button
          type="button"
          className="model-list-section-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="model-list-section-chevron" aria-hidden="true" />
          <span>Access Points</span>
          <span className="model-list-section-count">{visibleRows.length}</span>
        </button>
        <label className="model-table-search model-list-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter access points"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {isExpanded && rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table"
            style={{ "--model-runnable-table-width": `${tableWidth}px` } as CSSProperties}
          >
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "DEP / Operation / Trigger", key: "target" as const },
                  { label: "Access", key: "access" as const },
                  { label: "Name", key: "name" as const }
                ].map((column, index) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => startColumnResize(event, index)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.name}:${row.access}:${row.target}:${index}`}>
                  <td title={row.target}>{row.target}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching access points.</div>}
        </div>
      ) : isExpanded ? (
        <div className="model-list-empty">No items discovered.</div>
      ) : null}
    </section>
  );
}

function ModelRunnableTriggerEventsTable(props: { details: RunnableTriggerEventDetail[]; fallbackItems: string[] }) {
  const { details, fallbackItems } = props;
  const [columnWidths, setColumnWidths] = useState([220, 180, 180, 180, 240]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: TriggerEventTableColumnKey; direction: SortDirection }>({
    key: "trigger",
    direction: "asc"
  });
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          trigger: "-",
          type: "-",
          disabledInModes: "-",
          activationReason: "-",
          name: item
        }));
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.trigger, row.type, row.disabledInModes, row.activationReason, row.name].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => compareTriggerEventRows(left, right, sort));
  }, [rows, searchQuery, sort]);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const changeSort = (key: TriggerEventTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex] ?? 180;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((currentWidths) =>
        currentWidths.map((width, index) => (index === columnIndex ? Math.max(120, startWidth + delta) : width))
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <section className="model-list-section model-trigger-events-section">
      <div className="model-list-section-header">
        <button
          type="button"
          className="model-list-section-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="model-list-section-chevron" aria-hidden="true" />
          <span>Trigger Events</span>
          <span className="model-list-section-count">{visibleRows.length}</span>
        </button>
        <label className="model-table-search model-list-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter trigger events"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {isExpanded && rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table"
            style={{ "--model-runnable-table-width": `${tableWidth}px` } as CSSProperties}
          >
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "Trigger", key: "trigger" as const },
                  { label: "Type", key: "type" as const },
                  { label: "Disable in modes", key: "disabledInModes" as const },
                  { label: "Activation Reason", key: "activationReason" as const },
                  { label: "Name", key: "name" as const }
                ].map((column, index) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => startColumnResize(event, index)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.name}:${row.type}:${row.trigger}:${index}`}>
                  <td title={row.trigger}>{row.trigger}</td>
                  <td title={row.type}>{row.type}</td>
                  <td title={row.disabledInModes}>{row.disabledInModes}</td>
                  <td title={row.activationReason}>{row.activationReason}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching trigger events.</div>}
        </div>
      ) : isExpanded ? (
        <div className="model-list-empty">No items discovered.</div>
      ) : null}
    </section>
  );
}

function stringifyAccessPointCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function normalizePortDefinedArgumentValues(values: PortDefinedArgumentValueDetail[]) {
  return values.map((value) => ({
    index: stringifyAccessPointCell(value.index),
    name: stringifyAccessPointCell(value.name),
    dataType: stringifyAccessPointCell(value.dataType),
    value: stringifyAccessPointCell(value.value)
  }));
}

function normalizeCommunicationSpecDetails(values: CommunicationSpecDetail[]) {
  return values.map((record) => ({
    index: stringifyAccessPointCell(record.index),
    dataElement: stringifyAccessPointCell(record.dataElement),
    comSpec: stringifyAccessPointCell(record.comSpec),
    comSpecDirection: parseCommunicationSpecDirection(record.comSpecDirection, record.comSpec),
    initValue: stringifyAccessPointCell(record.initValue),
    initValueType: stringifyAccessPointCell(record.initValueType),
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

function mapInterfaceMemberDetails(members: InterfaceDetailMember[]): CommunicationSpecDetail[] {
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

const handleOutOfRangeOptions = ["None", "Ignore", "Saturate", "Wrap", "Replace", "Invalidate"];

const transmissionModeOptions = [
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

function getRxFilterOptions(value: string) {
  const option = formatRxFilterOption(value);
  return rxFilterOptions.includes(option) ? rxFilterOptions : [...rxFilterOptions, option];
}

function formatRxFilterOption(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return "None";
  }

  const labeledMatch = trimmed.match(/(?:^|,\s*)Data Filter Type:\s*([^,]+)/i);
  return (labeledMatch?.[1] ?? trimmed).trim();
}

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

function formatHandleOutOfRangeOption(value: string) {
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

function formatTransmissionModeOption(value: string) {
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

function readEnabledMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "-" && normalized !== "false" && normalized !== "none" && normalized !== "no";
}

function readTransformationErrorHandlingMetadata(value: string | undefined) {
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
