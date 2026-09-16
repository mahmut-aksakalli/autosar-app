import { useEffect, useRef, useState } from "react";
import type { AutosarEntity, EntityDetailPayload, InterfaceDetailMember } from "../../../../src/shared/contracts";
import {
  compareTableText,
  formatAutosarTagText,
  formatCalibrationAccess,
  formatHandleInvalidOption,
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatReferenceShortName,
  initValueTypeOptions,
  ModelCommunicationSpecSubsection,
  ModelInitValueDisplay,
  readBooleanMetadata,
  splitMetadataList
} from "./InspectorShared";

export function ModelEntityDetails(props: { title: string; entity: AutosarEntity }) {
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
