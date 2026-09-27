import type { InterfaceDetailMember } from "../../../../../../src/shared/contracts";
import { formatReferenceShortName } from "../DetailsFormatters";
import "./OperationPossibleErrors.css";

/** Show interface-defined errors and which ones the selected operation can return. */
export function OperationPossibleErrors(props: {
  applicationErrors: InterfaceDetailMember[];
  selectedErrors: string[];
}) {
  if (props.applicationErrors.length === 0) {
    return null;
  }

  const selectedErrors = new Set(props.selectedErrors.map(formatReferenceShortName));
  const sortedErrors = [...props.applicationErrors].sort((left, right) => {
    const leftCode = left.metadata?.["ERROR-CODE"] ?? "-";
    const rightCode = right.metadata?.["ERROR-CODE"] ?? "-";
    return leftCode.localeCompare(rightCode, undefined, { numeric: true }) ||
      left.label.localeCompare(right.label);
  });

  return (
    <section className="model-operation-errors">
      <div className="model-operation-errors-connector" aria-hidden="true">
        <span>has errors</span>
      </div>
      <div className="model-port-argument-section">
        <h3>Application Errors</h3>
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table model-operation-errors-table">
            <thead>
              <tr>
                <th>Valid</th>
                <th>Error Code</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {sortedErrors.map((error) => (
                <tr key={error.semanticPath ?? error.label}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedErrors.has(error.label)}
                      aria-label={`${error.label} is a possible error`}
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
      </div>
    </section>
  );
}
