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

function ModelKeyValueSurface(props: {
  title: string;
  rows: Array<[string, string]>;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, rows } = props;
  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-semantic-kv">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "-"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModelEntityDetailsSurface(props: { title: string; entity: AutosarEntity }) {
  const { title, entity } = props;
  const metadata = entity.metadata ?? {};
  const details = entity.details?.entity ?? { fields: [], tables: [] };
  const interfaceMembers = entity.type === "interface"
    ? entity.details?.interfaceMembers ?? []
    : [];
  const interfaceTables = entity.type === "interface"
    ? buildInterfaceDetailTables(entity, interfaceMembers)
    : [];
  const interfaceType = details.fields.find((field) => field.label === "Interface Type")?.value ?? "-";
  const isService = details.fields.find((field) => field.label === "Is Service")?.value ?? "false";
  const fields = entity.type === "interface"
    ? [
        { label: "Name", value: entity.shortName },
        { label: "Port Interface Type", value: interfaceType },
        { label: "Package", value: entity.parentSemanticPath ?? entity.packagePath ?? "-" },
        { label: "Is Service", value: isService },
        { label: "Description", value: metadata.DESCRIPTION ?? "-" },
        ...details.fields.filter(
          (field) => field.label !== "Interface Type" && field.label !== "Is Service" && field.label !== "Service Kind"
        )
      ]
    : [
        { label: "Name", value: entity.shortName },
        { label: "AUTOSAR Type", value: formatAutosarTagText(entity.rawTagName) },
        { label: "Package Path", value: entity.parentSemanticPath ?? entity.packagePath ?? "-" },
        ...(metadata.DESCRIPTION ? [{ label: "Description", value: metadata.DESCRIPTION }] : []),
        ...details.fields
      ];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {fields.map((field, index) => (
            <div key={`${field.label}:${index}`}>
              <span>{field.label}</span>
              <strong title={field.value}>
                {entity.type === "interface" && field.label === "Is Service" ? (
                  <input type="checkbox" checked={readBooleanMetadata(field.value) === true} disabled readOnly />
                ) : field.valueType ? (
                  <span className="model-inline-value-with-select">
                    <select value={formatInitValueTypeOption(field.valueType)} disabled>
                      {initValueTypeOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    <ModelInitValueDisplay value={field.value} type={field.valueType} />
                  </span>
                ) : field.label === "Package Path" || field.label === "Package" ? field.value : field.value.startsWith("/") ? formatReferenceShortName(field.value) : field.value}
              </strong>
            </div>
          ))}
        </div>
        {entity.type === "interface" && entity.interfaceKind === "sender-receiver" ? (
          <ModelInterfaceDataElementsSection members={interfaceMembers} />
        ) : null}
        {entity.type === "interface" && entity.interfaceKind === "client-server" ? (
          <ModelInterfaceOperationsSection members={interfaceMembers} />
        ) : null}
        {[...details.tables, ...interfaceTables].map((table) => (
          <ModelEntityDetailTable key={table.title} table={table} />
        ))}
      </div>
    </div>
  );
}

function ModelEntityDetailTable(props: { table: EntityDetailPayload["tables"][number] }) {
  const { table } = props;
  return (
    <section className="model-port-argument-section">
      <h3>{table.title}</h3>
      {table.rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead><tr>{table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={`${table.title}:${index}`}>
                  {table.columns.map((column) => {
                    const value = row[column.key] || "-";
                    return <td key={column.key} title={value}>{value.startsWith("/") ? formatReferenceShortName(value) : value}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="model-list-empty">No {table.title.toLowerCase()} discovered.</div>}
    </section>
  );
}

function ModelInterfaceDataElementsSection(props: { members: InterfaceDetailMember[] }) {
  const dataElements = props.members.filter((member) => member.kind === "dataElement");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    dataElements[0]?.semanticPath ?? dataElements[0]?.label
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedElement =
    dataElements.find((member) => (member.semanticPath ?? member.label) === selectedKey) ?? dataElements[0];

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) return;

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
  }, [dataElements.length]);

  return (
    <section className="model-port-argument-section model-port-comspec-section">
      <h3>Data Elements</h3>
      {dataElements.length > 0 ? (
        <div className="model-comspec-master-detail">
          <div
            ref={tableWrapRef}
            className="model-runnable-table-scroll model-comspec-table-wrap"
            style={tableViewportHeight ? { height: `${tableViewportHeight}px` } : undefined}
          >
            <table className="model-runnable-table">
              <thead>
                <tr><th style={{ width: "70px" }}>Index</th><th>Data Element</th></tr>
              </thead>
              <tbody>
                {dataElements.map((member, index) => {
                  const key = member.semanticPath ?? member.label;
                  const isSelected = key === (selectedElement?.semanticPath ?? selectedElement?.label);
                  return (
                    <tr key={key} className={isSelected ? "is-selected" : undefined}>
                      <td>{index + 1}</td>
                      <td title={member.semanticPath ?? member.label}>
                        <button
                          type="button"
                          className="model-table-cell-button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedKey(key)}
                        >
                          {member.label}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="model-comspec-detail-panel" aria-label="Data Element details">
            {selectedElement ? (
              <>
                <div className="model-comspec-detail-heading">
                  <span>Data Element</span>
                  <strong title={selectedElement.semanticPath}>{selectedElement.label}</strong>
                </div>
                <ModelInterfaceDataElementDetails member={selectedElement} />
              </>
            ) : <div className="model-list-empty">Select a data element.</div>}
          </aside>
        </div>
      ) : <div className="model-list-empty">No data elements discovered.</div>}
    </section>
  );
}

function ModelInterfaceDataElementDetails(props: { member: InterfaceDetailMember }) {
  const metadata = props.member.metadata ?? {};
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title="Data Element Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div><span>Data Type</span><strong>{formatReferenceShortName(metadata.TYPE)}</strong></div>
          <div><span>Data Constraints</span><strong>{formatReferenceShortName(metadata["DATA-CONSTRAINTS"])}</strong></div>
          <div><span>Addressing Method</span><strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong></div>
          <div>
            <span>Use queued communication</span>
            <strong><input type="checkbox" checked={readBooleanMetadata(metadata["IS-QUEUED"]) === true} disabled readOnly /></strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option><option>Read</option><option>Write</option><option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong>
              <select value={formatHandleInvalidOption(metadata["HANDLE-INVALID"] ?? "-")} disabled>
                <option>Keep</option><option>Replace</option><option>None</option>
              </select>
            </strong>
          </div>
          <div><span>Description</span><strong>{metadata.DESCRIPTION ?? "-"}</strong></div>
        </div>
      </ModelCommunicationSpecSubsection>
    </div>
  );
}

function ModelInterfaceOperationsSection(props: { members: InterfaceDetailMember[] }) {
  const operations = props.members.filter((member) => member.kind === "operation");
  const applicationErrors = props.members
    .filter((member) => member.kind === "applicationError")
    .slice()
    .sort((left, right) =>
      compareAutosarErrorCodes(left.metadata?.["ERROR-CODE"] ?? "-", right.metadata?.["ERROR-CODE"] ?? "-") ||
      compareTableText(left.label, right.label)
    );
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    operations[0]?.semanticPath ?? operations[0]?.label
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedOperation =
    operations.find((member) => (member.semanticPath ?? member.label) === selectedKey) ?? operations[0];

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) return;

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
  }, [operations.length]);

  return (
    <section className="model-port-argument-section model-port-comspec-section">
      <h3>Operations</h3>
      {operations.length > 0 ? (
        <div className="model-comspec-master-detail">
          <div
            ref={tableWrapRef}
            className="model-runnable-table-scroll model-comspec-table-wrap"
            style={tableViewportHeight ? { height: `${tableViewportHeight}px` } : undefined}
          >
            <table className="model-runnable-table">
              <thead><tr><th style={{ width: "70px" }}>Index</th><th>Operation</th></tr></thead>
              <tbody>
                {operations.map((operation, index) => {
                  const key = operation.semanticPath ?? operation.label;
                  const isSelected = key === (selectedOperation?.semanticPath ?? selectedOperation?.label);
                  return (
                    <tr key={key} className={isSelected ? "is-selected" : undefined}>
                      <td>{index + 1}</td>
                      <td title={operation.semanticPath ?? operation.label}>
                        <button
                          type="button"
                          className="model-table-cell-button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedKey(key)}
                        >
                          {operation.label}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="model-comspec-detail-panel" aria-label="Operation details">
            {selectedOperation ? (
              <>
                <div className="model-comspec-detail-heading">
                  <span>Operation</span>
                  <strong title={selectedOperation.semanticPath}>{selectedOperation.label}</strong>
                </div>
                <ModelInterfaceOperationDetails operation={selectedOperation} applicationErrors={applicationErrors} />
              </>
            ) : <div className="model-list-empty">Select an operation.</div>}
          </aside>
        </div>
      ) : <div className="model-list-empty">No operations discovered.</div>}
    </section>
  );
}

function ModelInterfaceOperationDetails(props: {
  operation: InterfaceDetailMember;
  applicationErrors: InterfaceDetailMember[];
}) {
  const metadata = props.operation.metadata ?? {};
  const argumentsRows = (props.operation.operationArguments ?? []).map((argument) => ({
    name: argument.name ?? "-",
    type: argument.type ?? "-",
    direction: argument.direction ? formatAutosarTagText(argument.direction) : "-",
    serverPolicy: argument.serverPolicy ? formatAutosarTagText(argument.serverPolicy) : "-"
  }));
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title="Operation Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Fire and Forget</span>
            <strong><input type="checkbox" checked={readBooleanMetadata(metadata["FIRE-AND-FORGET"]) === true} disabled readOnly /></strong>
          </div>
          <div>
            <span>Diagnostic Argument Integrity</span>
            <strong><input type="checkbox" checked={readBooleanMetadata(metadata["DIAG-ARG-INTEGRITY"]) === true} disabled readOnly /></strong>
          </div>
          <div><span>Description</span><strong>{metadata.DESCRIPTION ?? "-"}</strong></div>
        </div>
      </ModelCommunicationSpecSubsection>
      <ModelOperationPossibleErrors
        applicationErrors={props.applicationErrors}
        selectedErrors={splitMetadataList(metadata.ERRORS)}
      />
      <ModelEntityDetailTable
        table={{
          title: "Arguments",
          columns: [
            { key: "name", label: "Name" },
            { key: "type", label: "Data Type" },
            { key: "direction", label: "Direction" },
            { key: "serverPolicy", label: "Server Argument Implementation Policy" }
          ],
          rows: argumentsRows
        }}
      />
    </div>
  );
}

function ModelOperationPossibleErrors(props: {
  applicationErrors: InterfaceDetailMember[];
  selectedErrors: string[];
}) {
  const selectedErrors = new Set(props.selectedErrors.map((error) => formatReferenceShortName(error)));
  return (
    <section className="model-port-argument-section">
      <h3>Possible Errors</h3>
      {props.applicationErrors.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table model-operation-errors-table">
            <thead>
              <tr>
                <th>Selected</th>
                <th>Error Code</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {props.applicationErrors.map((error) => (
                <tr key={error.semanticPath ?? error.label}>
                  <td>
                    <input type="checkbox" checked={selectedErrors.has(error.label)} disabled readOnly />
                  </td>
                  <td>{error.metadata?.["ERROR-CODE"] ?? "-"}</td>
                  <td title={error.label}>{error.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="model-list-empty">No application errors discovered.</div>}
    </section>
  );
}

function buildInterfaceDetailTables(entity: AutosarEntity, members: InterfaceDetailMember[]): EntityDetailPayload["tables"] {
  const metadata = (member: InterfaceDetailMember) => member.metadata ?? {};
  if (entity.interfaceKind === "sender-receiver") {
    return [];
  }
  if (entity.interfaceKind === "client-server") {
    const applicationErrors = members
      .filter((member) => member.kind === "applicationError")
      .map((member) => ({
        name: member.label,
        code: metadata(member)["ERROR-CODE"] ?? "-"
      }))
      .sort((left, right) => compareAutosarErrorCodes(left.code, right.code) || compareTableText(left.name, right.name));
    return [
      {
        title: "Application Errors",
        columns: [{ key: "code", label: "Error Code" }, { key: "name", label: "Error" }],
        rows: applicationErrors
      }
    ];
  }

  if (entity.interfaceKind === "mode-switch") {
    return [{
      title: "Mode Groups",
      columns: [{ key: "name", label: "Name" }, { key: "type", label: "Mode Declaration Group" }],
      rows: members.filter((member) => member.kind === "modeGroup").map((member) => ({
        name: member.label, type: metadata(member).TYPE ?? "-"
      }))
    }];
  }

  if (entity.interfaceKind === "trigger") {
    return [{
      title: "Triggers",
      columns: [
        { key: "name", label: "Name" }, { key: "policy", label: "Implementation Policy" },
        { key: "period", label: "Trigger Period" }
      ],
      rows: members.filter((member) => member.kind === "trigger").map((member) => ({
        name: member.label,
        policy: metadata(member)["SW-IMPL-POLICY"] ?? "-",
        period: metadata(member)["TRIGGER-PERIOD"] ?? "-"
      }))
    }];
  }

  const expectedKind = entity.interfaceKind === "parameter" ? "parameter" : entity.interfaceKind === "nv-data" ? "nvData" : "dataElement";
  return [{
    title: entity.interfaceKind === "parameter" ? "Parameters" : entity.interfaceKind === "nv-data" ? "NV Data" : "Data Elements",
    columns: [
      { key: "name", label: "Name" }, { key: "type", label: "Data Type" },
      { key: "initValue", label: "Init Value" }, { key: "initType", label: "Init Value Type" },
      { key: "calibration", label: "Measurement&Calibration" }, { key: "addressing", label: "Addressing Method" }
    ],
    rows: members.filter((member) => member.kind === expectedKind).map((member) => ({
      name: member.label,
      type: metadata(member).TYPE ?? "-",
      initValue: metadata(member)["INITIAL-VALUE"] ?? "-",
      initType: formatInitValueTypeOption(metadata(member)["INITIAL-VALUE-TYPE"] ?? "-"),
      calibration: formatCalibrationAccess(metadata(member)["SW-CALIBRATION-ACCESS"]),
      addressing: metadata(member)["SW-ADDR-METHOD-REF"] ?? "-"
    }))
  }];
}

function compareAutosarErrorCodes(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumeric = Number.isFinite(leftNumber);
  const rightIsNumeric = Number.isFinite(rightNumber);
  if (leftIsNumeric && rightIsNumeric) return leftNumber - rightNumber;
  if (leftIsNumeric) return -1;
  if (rightIsNumeric) return 1;
  return compareTableText(left, right);
}

export function ModelParameterSurface(props: { title: string; parameter?: SwcInspectorItem }) {
  const { title, parameter } = props;
  const metadata = parameter?.metadata ?? {};
  const scope = formatParameterScopeOption(metadata.SCOPE);
  const measurementCalibration = formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-");

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Parameter Name</span>
            <strong>{parameter?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
          <div>
            <span>Scope</span>
            <strong>
              <select value={scope} disabled>
                <option>-</option>
                <option>Shared</option>
                <option>Per Instance</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={measurementCalibration} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelInterRunnableVariableSurface(props: { title: string; variable?: SwcInspectorItem }) {
  const { title, variable } = props;
  const metadata = variable?.metadata ?? {};
  const accessRows = variable?.details?.interRunnableVariableAccesses ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{variable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Communication</span>
            <strong>
              <select value={formatInterRunnableCommunicationOption(metadata.COMMUNICATION)} disabled>
                <option>-</option>
                <option>Explicit</option>
                <option>Implicit</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
        </div>
        <ModelInterRunnableVariableAccessTable rows={accessRows} />
      </div>
    </div>
  );
}

export function ModelPerInstanceMemorySurface(props: { title: string; item?: SwcInspectorItem }) {
  const { title, item } = props;
  const metadata = item?.metadata ?? {};

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{item?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Nvm Block Need</span>
            <strong>{formatReferenceShortName(metadata["NVM-BLOCK-NEED"])}</strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelServiceDependencySurface(props: { title: string; item?: SwcInspectorItem }) {
  const { title, item } = props;
  const metadata = item?.metadata ?? {};
  const serviceNeedDetails = parseServiceNeedDetailFields(
    item?.details?.serviceNeedFields ?? [],
    metadata["SERVICE-NEED-DETAILS"]
  );
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  const isNvBlockNeeds = serviceType === "nvblockneeds";
  const isDiagnosticEnableConditionNeeds = serviceType === "diagnosticenableconditionneeds";
  const detailRows = getServiceNeedDetailRows(
    item?.label,
    metadata,
    serviceNeedDetails,
    item?.details?.assignedPorts ?? []
  );
  const assignedData = isNvBlockNeeds
    ? parseNvmAssignedDataDetails(metadata, item?.details?.assignedData ?? [])
    : [];
  const dataAssignments = isDiagnosticEnableConditionNeeds
    ? item?.details?.assignedData ?? []
    : [];
  const assignedPorts = item?.details?.assignedPorts ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {detailRows.map((detail) => (
            <ModelServiceNeedDetailRow key={detail.label} detail={detail} />
          ))}
        </div>
        {isNvBlockNeeds ? <ModelNvmAssignedDataTable rows={assignedData} /> : null}
        {isDiagnosticEnableConditionNeeds ? <ModelServiceDataAssignmentsTable rows={dataAssignments} /> : null}
        <ModelServiceAssignedPortsTable
          rows={assignedPorts}
          title={isDiagnosticEnableConditionNeeds ? "Port Assignments" : "Assigned Ports"}
        />
      </div>
    </div>
  );
}

function ModelServiceNeedDetailRow(props: { detail: ServiceNeedDisplayDetail }) {
  const { detail } = props;
  return (
    <div>
      <span>{detail.label}</span>
      <strong>
        {detail.kind === "checkbox" ? (
          <input type="checkbox" checked={detail.checked === true} disabled readOnly />
        ) : detail.kind === "checkboxDropdown" ? (
          <span className="model-inline-value-with-select">
            <input type="checkbox" checked={detail.checked === true} disabled readOnly />
            <select value={detail.value || "-"} disabled>
              {getServiceNeedSelectOptions(detail.value || "-", detail.options).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </span>
        ) : detail.kind === "dropdown" ? (
          <select value={detail.value || "-"} disabled>
            <option>{detail.value || "-"}</option>
          </select>
        ) : detail.value}
      </strong>
    </div>
  );
}

function ModelNvmAssignedDataTable(props: { rows: NvmAssignedDataDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>NVM Assigned Data</h3>
      <div className="model-runnable-table-scroll">
        <table className="model-runnable-table">
          <thead>
            <tr>
              <th>Assigned Role</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.role}>
                <td title={row.role}>{row.role}</td>
                <td title={row.value}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelServiceDataAssignmentsTable(props: { rows: ServiceAssignedDataDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Data Assignments</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Port Prototype</th>
                <th>Port Interface</th>
                <th>Data Element Prototype</th>
                <th>Assigned Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.portPrototype}:${row.dataElementPrototype}:${row.assignedRole}:${index}`}>
                  <td title={row.portPrototypeRef ?? row.portPrototype}>{row.portPrototype}</td>
                  <td title={row.portInterfaceRef ?? row.portInterface}>{row.portInterface}</td>
                  <td title={row.dataElementPrototypeRef ?? row.dataElementPrototype}>{row.dataElementPrototype}</td>
                  <td title={row.assignedRole}>{row.assignedRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No data assignments discovered.</div>
      )}
    </section>
  );
}

function ModelServiceAssignedPortsTable(props: { rows: ServiceAssignedPortDetail[]; title?: string }) {
  const { rows, title = "Assigned Ports" } = props;
  return (
    <section className="model-port-argument-section">
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Port Prototype</th>
                <th>Port Interface</th>
                <th>Assigned Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.portPrototype}:${row.assignedRole}:${index}`}>
                  <td title={row.portPrototypeRef ?? row.portPrototype}>{row.portPrototype}</td>
                  <td title={row.portInterfaceRef ?? row.portInterface}>{row.portInterface}</td>
                  <td title={row.assignedRole}>{row.assignedRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No assigned ports discovered.</div>
      )}
    </section>
  );
}

function ModelInterRunnableVariableAccessTable(props: { rows: InterRunnableVariableAccessDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Inter-Runnable Variable Access</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Runnable</th>
                <th>Access</th>
                <th>Access Point</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.runnable}:${row.access}:${row.accessPoint}:${index}`}>
                  <td title={row.runnable}>{row.runnable}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.accessPoint}>{row.accessPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No accessing runnables discovered.</div>
      )}
    </section>
  );
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

function formatAutosarTagText(value: string | undefined): string {
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

function formatParameterScopeOption(value: string | undefined): string {
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

function formatInterRunnableCommunicationOption(value: string | undefined): string {
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

function ModelCommunicationSpecSubsection(props: { title: string; defaultOpen?: boolean; children: ReactNode }) {
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

function formatMeasurementCalibrationOption(value: string) {
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

function formatHandleInvalidOption(value: string) {
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

const initValueTypeOptions = [
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

function ModelInitValueDisplay(props: { value: string; type: string }) {
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

function normalizeAutosarEnumToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type ServiceNeedDetailField = {
  tag?: string;
  label: string;
  value: string;
  kind: "checkbox" | "dropdown";
  checked: boolean;
};

type ServiceNeedDisplayDetail = {
  label: string;
  value: string;
  kind: "checkbox" | "checkboxDropdown" | "dropdown" | "number" | "text";
  checked?: boolean;
  options?: string[];
};

interface NvmAssignedDataDetail {
  role: "ramBlock" | "defaultValue";
  value: string;
}

const nvBlockNeedsDetailOrder: Array<{
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
}> = [
  { label: "Name", kind: "text" },
  { label: "Service Need", kind: "text" },
  { label: "Category", kind: "text" },
  { label: "Ram Block Status Control", tag: "RAM-BLOCK-STATUS-CONTROL", kind: "dropdown" },
  { label: "Reliability", tag: "RELIABILITY", kind: "dropdown" },
  { label: "Writing Priority", tag: "WRITING-PRIORITY", kind: "dropdown" },
  { label: "Number of Datasets", tag: "N-DATA-SETS", aliases: ["N Data Sets"], kind: "number", defaultValue: "0" },
  { label: "Number of ROM Block", tag: "N-ROM-BLOCKS", aliases: ["N Rom Blocks"], kind: "number", defaultValue: "0" },
  { label: "Calc Ram Block Crc", tag: "CALC-RAM-BLOCK-CRC", kind: "checkbox", defaultValue: "false" },
  { label: "Readonly", tag: "READONLY", kind: "checkbox", defaultValue: "false" },
  {
    label: "Resistant To Changed Sw",
    tag: "RESISTANT-TO-CHANGED-SW",
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Restore At Start", tag: "RESTORE-AT-START", kind: "checkbox", defaultValue: "false" },
  { label: "Store At Shutdown", tag: "STORE-AT-SHUTDOWN", kind: "checkbox", defaultValue: "false" },
  { label: "Use Crc Comp Mechanism", tag: "USE-CRC-COMP-MECHANISM", kind: "checkbox", defaultValue: "false" },
  { label: "Check Static Block ID", tag: "CHECK-STATIC-BLOCK-ID", kind: "checkbox", defaultValue: "false" },
  { label: "Write Verification", tag: "WRITE-VERIFICATION", kind: "checkbox", defaultValue: "false" },
  { label: "Write only once", tag: "WRITE-ONLY-ONCE", kind: "checkbox", defaultValue: "false" },
  {
    label: "Use Auto Validation at Shutdown",
    tag: "USE-AUTO-VALIDATION-AT-SHUT-DOWN",
    aliases: ["Use Auto Validation At Shut Down"],
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Store Emergency", tag: "STORE-EMERGENCY", kind: "checkbox", defaultValue: "false" },
  { label: "Store Immediate", tag: "STORE-IMMEDIATE", kind: "checkbox", defaultValue: "false" },
  { label: "Store Cyclic", tag: "STORE-CYCLIC", kind: "checkbox", defaultValue: "false" },
  { label: "Cyclic Writing Period", tag: "CYCLIC-WRITING-PERIOD", kind: "number", defaultValue: "0 sec" }
];

type ServiceNeedDetailDefinition = {
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
  options?: string[];
  formatter?: (value: string) => string;
};

const serviceNeedDetailOrders: Record<string, ServiceNeedDetailDefinition[]> = {
  bswmgrneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  commgruserneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Max Comm Mode", tag: "MAX-COMM-MODE", kind: "dropdown" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  cryptoserviceneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    {
      label: "Max Key Length",
      tag: "MAX-KEY-LENGTH",
      kind: "number",
      defaultValue: "0 bytes",
      formatter: formatBytesValue
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticcommunicationmanagerneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    {
      label: "Service Request Callback Type",
      tag: "SERVICE-REQUEST-CALLBACK-TYPE",
      kind: "checkboxDropdown",
      options: ["Manufacturer", "Supplier"]
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticenableconditionneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    { label: "DID Number", tag: "DID-NUMBER", aliases: ["Did Number"], kind: "number", defaultValue: "0" },
    {
      label: "Processing Style",
      tag: "PROCESSING-STYLE",
      kind: "checkboxDropdown",
      options: ["Asynch", "Synch", "Asynch with Error"]
    },
    { label: "Port Assignment", kind: "text" },
    { label: "Fixed Length", tag: "FIXED-LENGTH", kind: "checkbox", defaultValue: "false" }
  ]
};

function getGenericServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  const rows: ServiceNeedDisplayDetail[] = [
    { label: "Name", value: itemLabel ?? "-", kind: "text" },
    { label: "Service Need", value: metadata["SERVICE-NEED"] ?? "-", kind: "text" },
    { label: "Category", value: metadata.CATEGORY ?? "-", kind: "text" }
  ];

  if (details.length === 0) {
    return [...rows, { label: "Service Need Details", value: "-", kind: "text" }];
  }

  return [
    ...rows,
    ...details.map((detail) => ({
      label: detail.label,
      value: detail.value,
      kind: detail.kind,
      checked: detail.checked
    }))
  ];
}

function getServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[],
  assignedPorts: ServiceAssignedPortDetail[]
): ServiceNeedDisplayDetail[] {
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  if (serviceType === "nvblockneeds") {
    return getNvBlockNeedsDetailRows(itemLabel, metadata, details);
  }

  const definitions = serviceNeedDetailOrders[serviceType];
  if (!definitions) {
    return getGenericServiceNeedDetailRows(itemLabel, metadata, details);
  }

  return definitions.map((definition) =>
    buildServiceNeedDetailRow(definition, itemLabel, metadata, details, assignedPorts)
  );
}

function buildServiceNeedDetailRow(
  definition: ServiceNeedDetailDefinition,
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[],
  assignedPorts: ServiceAssignedPortDetail[]
): ServiceNeedDisplayDetail {
  if (definition.label === "Name") {
    return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
  }
  if (definition.label === "Service Need") {
    return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
  }
  if (definition.label === "Category") {
    return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
  }
  if (definition.label === "Port Assignment") {
    return {
      label: definition.label,
      value: formatAssignedPortPrototypeColumn(assignedPorts, metadata["ASSIGNED-PORTS"]),
      kind: definition.kind
    };
  }

  const detail = findServiceNeedDetail(details, definition);
  const rawValue = detail?.value;
  const fallback = definition.defaultValue ?? "-";
  const value = definition.formatter ? definition.formatter(rawValue ?? fallback) : rawValue || fallback;
  const checked =
    definition.kind === "checkbox"
      ? readBinaryServiceNeedDetailValue(value) === true
      : definition.kind === "checkboxDropdown"
        ? value !== "-" && readBinaryServiceNeedDetailValue(value) !== false
        : undefined;
  return {
    label: definition.label,
    value: definition.options ? normalizeServiceNeedOption(value, definition.options) : value,
    kind: definition.kind,
    checked,
    options: definition.options
  };
}

function getNvBlockNeedsDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  return nvBlockNeedsDetailOrder.map((definition) => {
    if (definition.label === "Name") {
      return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
    }
    if (definition.label === "Service Need") {
      return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
    }
    if (definition.label === "Category") {
      return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
    }

    const detail = findServiceNeedDetail(details, definition);
    const value = formatNvBlockNeedDetailValue(definition, detail?.value);
    const checked = definition.kind === "checkbox" ? readBinaryServiceNeedDetailValue(value) === true : undefined;
    return {
      label: definition.label,
      value,
      kind: definition.kind,
      checked
    };
  });
}

function findServiceNeedDetail(
  details: ServiceNeedDetailField[],
  definition: ServiceNeedDetailDefinition
) {
  const expectedKeys = [definition.tag, definition.label, ...(definition.aliases ?? [])]
    .filter((entry): entry is string => Boolean(entry))
    .map(normalizeAutosarEnumToken);
  return details.find((detail) => {
    const keys = [detail.tag, detail.label].filter((entry): entry is string => Boolean(entry)).map(normalizeAutosarEnumToken);
    return keys.some((key) => expectedKeys.includes(key));
  });
}

function formatBytesValue(value: string) {
  if (!value || value === "-") {
    return "0 bytes";
  }
  return /\bbytes?\b/i.test(value) ? value : `${value} bytes`;
}

function normalizeServiceNeedOption(value: string, options: string[]) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  return options.find((option) => normalizeAutosarEnumToken(option) === normalizedValue) ?? value;
}

function getServiceNeedSelectOptions(value: string, options: string[] | undefined) {
  const selectOptions = options && options.length > 0 ? options : [value];
  return selectOptions.includes(value) ? selectOptions : [value, ...selectOptions];
}

function formatNvBlockNeedDetailValue(
  definition: (typeof nvBlockNeedsDetailOrder)[number],
  value: string | undefined
) {
  const fallback = definition.defaultValue ?? "-";
  if (!value || value === "-") {
    return fallback;
  }

  if (definition.tag === "CYCLIC-WRITING-PERIOD") {
    return formatNvBlockCyclicWritingPeriod(value);
  }

  return value;
}

function formatNvBlockCyclicWritingPeriod(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }
  if (numericValue === 0) {
    return "0 sec";
  }
  if (Math.abs(numericValue) >= 1000 && Number.isInteger(numericValue) && numericValue % 1000 === 0) {
    return `${formatNumber(numericValue / 1000)} sec`;
  }
  if (Math.abs(numericValue) >= 1) {
    return `${formatNumber(numericValue)} msec`;
  }
  return formatTimeInterval(value);
}

function parseNvmAssignedDataDetails(
  metadata: Record<string, string>,
  assignedData: ServiceAssignedDataDetail[]
): NvmAssignedDataDetail[] {
  return [
    {
      role: "ramBlock",
      value: findAssignedDataValue(assignedData, "ramblock") ?? metadata["ASSIGNED-DATA-RAM-BLOCK"] ?? "-"
    },
    {
      role: "defaultValue",
      value: findAssignedDataValue(assignedData, "defaultvalue") ?? metadata["ASSIGNED-DATA-DEFAULT-VALUE"] ?? "-"
    }
  ];
}

function findAssignedDataValue(assignments: ServiceAssignedDataDetail[], normalizedRole: string) {
  return assignments.find((assignment) => normalizeAutosarEnumToken(assignment.assignedRole) === normalizedRole)?.value;
}

export function formatAssignedPortPrototypeColumn(
  details: ServiceAssignedPortDetail[],
  fallbackSummary: string | undefined
) {
  if (details.length > 0) {
    return details.map((detail) => detail.portPrototype).filter((value) => value !== "-").join(", ") || "-";
  }

  if (!fallbackSummary) {
    return "-";
  }

  const ports = fallbackSummary.split(",").flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
    return value ? [value] : [];
  });
  return ports.length > 0 ? ports.join(", ") : "-";
}

function parseServiceNeedDetailFields(
  structuredFields: ServiceNeedField[],
  fallbackSummary: string | undefined
): ServiceNeedDetailField[] {
  const fields: Array<{ tag?: string; label: string; value: string }> =
    structuredFields.length > 0
      ? structuredFields
      : parseServiceNeedDetailSummary(fallbackSummary).map((detail) => ({
          label: detail.label,
          value: detail.value
        }));

  return fields.map((detail) => {
    const checked = readBinaryServiceNeedDetailValue(detail.value);
    return {
      tag: detail.tag,
      label: detail.label,
      value: detail.value,
      kind: checked === undefined ? "dropdown" : "checkbox",
      checked: checked === true
    };
  });
}

function parseServiceNeedDetailSummary(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value.split(/,\s+(?=[A-Z][A-Za-z0-9 ]+:\s*)/).flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      return [];
    }
    const label = entry.slice(0, separatorIndex).trim();
    const detailValue = entry.slice(separatorIndex + 1).trim();
    return label && detailValue ? [{ label, value: detailValue }] : [];
  });
}

function readBinaryServiceNeedDetailValue(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return undefined;
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

function readBooleanMetadata(value: string | undefined) {
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

function splitMetadataList(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function formatTimeInterval(value: string | undefined) {
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

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}
