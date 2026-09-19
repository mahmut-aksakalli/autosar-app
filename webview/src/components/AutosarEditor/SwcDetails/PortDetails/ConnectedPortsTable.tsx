import { useMemo, useState } from "react";
import type { ConnectedPortReference } from "../../../../../../src/shared/contracts";
import { SortableResizableTableHeader } from "../../../Common/Table/TableHeaders";
import { useResizableTableColumns } from "../../../Common/Table/useResizableTableColumns";

type ConnectedPortColumnKey = "portName" | "portInterface" | "swcName";
type SortDirection = "asc" | "desc";

const CONNECTED_PORT_COLUMN_WIDTHS = [200, 260, 220];
const CONNECTED_PORT_COLUMNS: Array<{ key: ConnectedPortColumnKey; label: string }> = [
  { key: "portName", label: "Port Name" },
  { key: "portInterface", label: "Port Interface" },
  { key: "swcName", label: "SWC Name" }
];

export function ConnectedPortsTable(props: {
  connections: ConnectedPortReference[];
  onConnectionSelect?: (connection: ConnectedPortReference) => void;
}) {
  const [sort, setSort] = useState<{
    key: ConnectedPortColumnKey;
    direction: SortDirection;
  }>({
    key: "portName",
    direction: "asc"
  });
  const columnResize = useResizableTableColumns(CONNECTED_PORT_COLUMN_WIDTHS);
  const sortedConnections = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...props.connections].sort((left, right) => {
      return direction * left[sort.key].localeCompare(right[sort.key]);
    });
  }, [props.connections, sort]);

  function changeSort(key: ConnectedPortColumnKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  return (
    <section className="model-port-argument-section model-connected-ports-section">
      <h3>Connected Ports</h3>
      {sortedConnections.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table model-clickable-table"
            style={columnResize.tableStyle}
          >
            <colgroup>
              {columnResize.columnWidths.map((width, columnIndex) => (
                <col key={CONNECTED_PORT_COLUMNS[columnIndex]?.key ?? columnIndex} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {CONNECTED_PORT_COLUMNS.map((column, columnIndex) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => columnResize.startColumnResize(event, columnIndex)}
                    onResizeKeyDown={(event) =>
                      columnResize.resizeColumnWithKeyboard(event, columnIndex)
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedConnections.map((connection) => (
                <tr
                  key={`${connection.connectionId}:${connection.portId ?? connection.portName}`}
                  tabIndex={0}
                  role="button"
                  onClick={() => props.onConnectionSelect?.(connection)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onConnectionSelect?.(connection);
                    }
                  }}
                >
                  <td title={connection.portName}>{connection.portName}</td>
                  <td title={connection.portInterfaceRef ?? connection.portInterface}>
                    {connection.portInterface}
                  </td>
                  <td title={connection.swcName}>{connection.swcName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No connected ports discovered.</div>
      )}
    </section>
  );
}
