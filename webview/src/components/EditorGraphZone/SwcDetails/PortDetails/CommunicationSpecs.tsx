import { useEffect, useRef, useState } from "react";
import type { CommunicationSpecDetail, PortInterfaceKind } from "../../../../../../src/shared/contracts";
import { CollapsibleSection } from "../CollapsibleSection";
import {
  formatHandleInvalidOption,
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatOptionalMilliseconds,
  formatReferenceShortName,
  initValueTypeOptions,
  readBooleanMetadata,
  readEnabledMetadata
} from "../DetailsFormatters";
import { InitValueDisplay } from "../InitValueDisplay";
import {
  formatCommunicationSpecDirectionLabel,
  formatHandleOutOfRangeOption,
  formatRxFilterOption,
  formatTransmissionModeOption,
  getCommunicationSpecItemLabel,
  getRxFilterOptions,
  handleOutOfRangeOptions,
  transmissionModeOptions
} from "./CommunicationSpecHelper";

export function CommunicationSpecsSection(props: {
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
      {isExpanded && <CommunicationSpecsTable rows={rows} interfaceKind={interfaceKind} embedded />}
    </section>
  );
}

function CommunicationSpecsTable(props: {
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
                <CommunicationSpecDetails row={selectedRow} itemLabel={itemLabel} />
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

function CommunicationSpecDetails(props: { row: CommunicationSpecDetail; itemLabel: string }) {
  const { row, itemLabel } = props;
  return (
    <div className="model-communication-spec-details">
      <CollapsibleSection title={`${itemLabel} Properties`} defaultOpen>
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
      </CollapsibleSection>

      {row.comSpecDirection === "sender" && <SenderComSpecDetails row={row} />}
      {row.comSpecDirection === "receiver" && <ReceiverComSpecDetails row={row} />}
      {row.comSpecDirection !== "sender" && row.comSpecDirection !== "receiver" && (
        <GenericComSpecDetails row={row} />
      )}
    </div>
  );
}

function SenderComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <CollapsibleSection title="Sender ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <InitValueDisplay value={row.initValue} type={row.initValueType} />
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
    </CollapsibleSection>
  );
}

function ReceiverComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <CollapsibleSection title="Receiver ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <InitValueDisplay value={row.initValue} type={row.initValueType} />
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
    </CollapsibleSection>
  );
}

function GenericComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <CollapsibleSection title={`${formatCommunicationSpecDirectionLabel(row.comSpecDirection)} ComSpec`} defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <InitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{row.queueLength}</strong>
        </div>
      </div>
    </CollapsibleSection>
  );
}
