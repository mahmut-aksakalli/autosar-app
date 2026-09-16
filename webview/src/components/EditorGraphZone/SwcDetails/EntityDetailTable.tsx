import type { EntityDetailPayload } from "../../../../../src/shared/contracts";
import { formatReferenceShortName } from "./DetailsFormatters";

export function EntityDetailTable(props: { table: EntityDetailPayload["tables"][number] }) {
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
