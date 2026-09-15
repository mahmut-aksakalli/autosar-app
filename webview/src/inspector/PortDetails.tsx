import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CommunicationSpecDetail,
  InterfaceDetailMember,
  PortDefinedArgumentValueDetail,
  PortInterfaceKind,
  SwcGraphPort
} from "../../../src/shared/contracts";
import {
  formatBooleanMetadata,
  formatHandleInvalidOption,
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatOptionalMilliseconds,
  formatReferenceShortName,
  initValueTypeOptions,
  ModelCommunicationSpecSubsection,
  ModelInitValueDisplay,
  normalizeAutosarEnumToken,
  readBooleanMetadata,
  readEnabledMetadata,
  readTransformationErrorHandlingMetadata,
  stringifyAccessPointCell
} from "./InspectorShared";

export function ModelPortDetails(props: {
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
