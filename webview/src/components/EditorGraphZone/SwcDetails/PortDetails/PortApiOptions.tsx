import { useState } from "react";
import type { PortDefinedArgumentValueDetail, SwcGraphPort } from "../../../../../../src/shared/contracts";
import {
  readBooleanMetadata,
  readTransformationErrorHandlingMetadata
} from "../DetailsFormatters";

export function PortApiOptionsSection(props: {
  port?: SwcGraphPort;
  argumentValues: PortDefinedArgumentValueDetail[];
}) {
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
                  checked={readBooleanMetadata(props.port?.metadata?.["ENABLE-INDIRECT-API"]) === true}
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
                  checked={readBooleanMetadata(props.port?.metadata?.["ENABLE-API-USAGE-BY-ADDRESS"]) === true}
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
                  checked={readTransformationErrorHandlingMetadata(props.port?.metadata?.["TRANSFORMATION-ERROR-HANDLING"])}
                  disabled
                  readOnly
                />
              </strong>
            </div>
          </div>
          <PortDefinedArgumentTable rows={props.argumentValues} />
        </>
      )}
    </section>
  );
}

function PortDefinedArgumentTable(props: { rows: PortDefinedArgumentValueDetail[] }) {
  return (
    <section className="model-port-argument-section">
      <h3>Port defined argument values</h3>
      {props.rows.length > 0 ? (
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
              {props.rows.map((row) => (
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
