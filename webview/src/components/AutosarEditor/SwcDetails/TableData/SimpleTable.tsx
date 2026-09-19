import { ResizableTableHeader } from "../../../Common/Table/TableHeaders";
import { useResizableTableColumns } from "../../../Common/Table/useResizableTableColumns";

export function SimpleTable(props: {
  title: string;
  emptyLabel: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | undefined>>;
}) {
  const columnResize = useResizableTableColumns(props.columns.map(() => 220));

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      {props.rows.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table
            className="model-inspector-section-table model-semantic-table"
            style={columnResize.tableStyle}
          >
            <colgroup>
              {columnResize.columnWidths.map((width, columnIndex) => (
                <col key={columnIndex} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {props.columns.map((column, columnIndex) => (
                  <ResizableTableHeader
                    key={column.key}
                    label={column.label}
                    onResize={(event) => columnResize.startColumnResize(event, columnIndex)}
                    onResizeKeyDown={(event) =>
                      columnResize.resizeColumnWithKeyboard(event, columnIndex)
                    }
                  />
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
