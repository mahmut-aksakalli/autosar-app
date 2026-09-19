export function SimpleTable(props: {
  title: string;
  emptyLabel: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | undefined>>;
}) {
  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      {props.rows.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table">
            <thead>
              <tr>
                {props.columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.id ?? JSON.stringify(row)}>
                  {props.columns.map((column) => (
                    <td key={column.key}>{row[column.key] || "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">{props.emptyLabel}</div>
      )}
    </div>
  );
}
