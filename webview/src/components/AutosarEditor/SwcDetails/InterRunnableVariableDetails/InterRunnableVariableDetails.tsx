import type { InterRunnableVariableAccessDetail, SwcInspectorItem } from "../../../../../../src/shared/contracts";
import {
  formatInterRunnableCommunicationOption,
  formatInitValueTypeOption,
  formatMeasurementCalibrationOption,
  formatReferenceShortName,
  initValueTypeOptions
} from "../../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../../Common/Details/InitValueDisplay";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";

export function InterRunnableVariableDetails(props: {
  title: string;
  variable?: SwcInspectorItem;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const metadata = props.variable?.metadata ?? {};
  const accessRows = props.variable?.details?.interRunnableVariableAccesses ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{props.variable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <ReferenceValue
              referencePath={metadata.TYPE}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <InitValueDisplay
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
        <InterRunnableVariableAccessTable rows={accessRows} />
      </div>
    </div>
  );
}

function InterRunnableVariableAccessTable(props: { rows: InterRunnableVariableAccessDetail[] }) {
  return (
    <section className="model-port-argument-section">
      <h3>Inter-Runnable Variable Access</h3>
      {props.rows.length > 0 ? (
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
              {props.rows.map((row, index) => (
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
