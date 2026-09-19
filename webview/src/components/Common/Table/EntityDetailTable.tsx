import type { EntityDetailPayload } from "../../../../../src/shared/contracts";
import { formatReferenceShortName } from "../Details/DetailsFormatters";

export function EntityDetailTable(props: { table: EntityDetailPayload["tables"][number] }) {
  return (
    <section className="model-port-argument-section">
      <h3>{props.table.title}</h3>
      {props.table.rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead><tr>{props.table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {props.table.rows.map((row, index) => (
                <tr key={`${props.table.title}:${index}`}>
                  {props.table.columns.map((column) => {
                    const value = row[column.key] || "-";
                    return <td key={column.key} title={value}>{value.startsWith("/") ? formatReferenceShortName(value) : value}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="model-list-empty">No {props.table.title.toLowerCase()} discovered.</div>}
    </section>
  );
}
