import { useEffect, useRef, useState } from "react";
import type { InterfaceDetailMember } from "../../../../../../src/shared/contracts";
import { CollapsibleSection } from "../../../Common/CollapsibleSection";
import {
  formatHandleInvalidOption,
  formatMeasurementCalibrationOption,
  formatReferenceShortName,
  readBooleanMetadata
} from "../../../Common/Details/DetailsFormatters";

export function SenderReceiverPortDetails(props: {
  members: InterfaceDetailMember[];
  preferredMemberPath?: string;
}) {
  const dataElements = props.members.filter((member) => member.kind === "dataElement");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    props.preferredMemberPath ?? dataElements[0]?.semanticPath ?? dataElements[0]?.label
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedElement =
    dataElements.find((member) => (member.semanticPath ?? member.label) === selectedKey) ??
    dataElements[0];

  useEffect(() => {
    if (props.preferredMemberPath) {
      setSelectedKey(props.preferredMemberPath);
    }
  }, [props.preferredMemberPath]);

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
    updateHeight();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
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
                <tr>
                  <th style={{ width: "70px" }}>Index</th>
                  <th>Data Element</th>
                </tr>
              </thead>
              <tbody>
                {dataElements.map((member, index) => {
                  const key = member.semanticPath ?? member.label;
                  const isSelected =
                    key === (selectedElement?.semanticPath ?? selectedElement?.label);
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
                <PortInterfaceDataElementDetails member={selectedElement} />
              </>
            ) : (
              <div className="model-list-empty">Select a data element.</div>
            )}
          </aside>
        </div>
      ) : (
        <div className="model-list-empty">No data elements discovered.</div>
      )}
    </section>
  );
}

function PortInterfaceDataElementDetails(props: { member: InterfaceDetailMember }) {
  const metadata = props.member.metadata ?? {};

  return (
    <div className="model-communication-spec-details">
      <CollapsibleSection title="Data Element Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Data Constraints</span>
            <strong>{formatReferenceShortName(metadata["DATA-CONSTRAINTS"])}</strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
          <div>
            <span>Use queued communication</span>
            <strong>
              <input
                type="checkbox"
                checked={readBooleanMetadata(metadata["IS-QUEUED"]) === true}
                disabled
                readOnly
              />
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select
                value={formatMeasurementCalibrationOption(
                  metadata["SW-CALIBRATION-ACCESS"] ?? "-"
                )}
                disabled
              >
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
              <select
                value={formatHandleInvalidOption(metadata["HANDLE-INVALID"] ?? "-")}
                disabled
              >
                <option>Keep</option>
                <option>Replace</option>
                <option>None</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{metadata.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
