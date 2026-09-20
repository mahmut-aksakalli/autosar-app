import { useEffect, useRef, useState } from "react";
import type { InterfaceDetailMember } from "../../../../../../src/shared/contracts";
import { CollapsibleSection } from "../../../Common/CollapsibleSection";
import { EntityDetailTable } from "../../../Common/Table/EntityDetailTable";
import {
  formatAutosarTagText,
  formatReferenceShortName,
  readBooleanMetadata,
  splitMetadataList
} from "../../../Common/Details/DetailsFormatters";
import { compareTableText } from "../../SwcDetails/TableData/TableData";
import { compareAutosarErrorCodes } from "../PortInterfaceDetailsHelper";

export function ClientServerPortDetails(props: {
  members: InterfaceDetailMember[];
  preferredMemberPath?: string;
}) {
  const operations = props.members.filter((member) => member.kind === "operation");
  const applicationErrors = props.members
    .filter((member) => member.kind === "applicationError")
    .slice()
    .sort((left, right) => {
      const errorCodeOrder = compareAutosarErrorCodes(
        left.metadata?.["ERROR-CODE"] ?? "-",
        right.metadata?.["ERROR-CODE"] ?? "-"
      );
      if (errorCodeOrder !== 0) {
        return errorCodeOrder;
      }
      return compareTableText(left.label, right.label);
    });
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    props.preferredMemberPath ?? operations[0]?.semanticPath ?? operations[0]?.label
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedOperation =
    operations.find((member) => (member.semanticPath ?? member.label) === selectedKey) ??
    operations[0];

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
              <thead>
                <tr>
                  <th style={{ width: "70px" }}>Index</th>
                  <th>Operation</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((operation, index) => {
                  const key = operation.semanticPath ?? operation.label;
                  const isSelected =
                    key === (selectedOperation?.semanticPath ?? selectedOperation?.label);
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
                <PortInterfaceOperationDetails
                  operation={selectedOperation}
                  applicationErrors={applicationErrors}
                />
              </>
            ) : (
              <div className="model-list-empty">Select an operation.</div>
            )}
          </aside>
        </div>
      ) : (
        <div className="model-list-empty">No operations discovered.</div>
      )}
    </section>
  );
}

function PortInterfaceOperationDetails(props: {
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
      <CollapsibleSection title="Operation Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Fire and Forget</span>
            <strong>
              <input
                type="checkbox"
                checked={readBooleanMetadata(metadata["FIRE-AND-FORGET"]) === true}
                disabled
                readOnly
              />
            </strong>
          </div>
          <div>
            <span>Diagnostic Argument Integrity</span>
            <strong>
              <input
                type="checkbox"
                checked={readBooleanMetadata(metadata["DIAG-ARG-INTEGRITY"]) === true}
                disabled
                readOnly
              />
            </strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{metadata.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>
      </CollapsibleSection>
      <OperationPossibleErrors
        applicationErrors={props.applicationErrors}
        selectedErrors={splitMetadataList(metadata.ERRORS)}
      />
      <EntityDetailTable
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

function OperationPossibleErrors(props: {
  applicationErrors: InterfaceDetailMember[];
  selectedErrors: string[];
}) {
  const selectedErrors = new Set(
    props.selectedErrors.map((error) => formatReferenceShortName(error))
  );

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
                    <input
                      type="checkbox"
                      checked={selectedErrors.has(error.label)}
                      disabled
                      readOnly
                    />
                  </td>
                  <td>{error.metadata?.["ERROR-CODE"] ?? "-"}</td>
                  <td title={error.label}>{error.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No application errors discovered.</div>
      )}
    </section>
  );
}
