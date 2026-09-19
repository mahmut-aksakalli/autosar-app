import { useMemo, useState } from "react";
import type { SwcGraphPort } from "../../../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../../../EditorTabs/EditorTabs";
import { formatBooleanMetadata, formatReferenceShortName } from "../DetailsFormatters";
import { formatPortDirectionLabel } from "../PortDetails/CommunicationSpecHelper";
import { comparePortRows, normalizeTableSearch } from "./TableData";
import type { PortTableColumnKey, SortDirection } from "./TableData";
import { SortableResizableTableHeader } from "../../../Common/Table/TableHeaders";
import { useResizableTableColumns } from "../../../Common/Table/useResizableTableColumns";

const PORT_COLUMN_WIDTHS = [180, 140, 140, 200, 360];

export function PortsTable(props: {
  title: string;
  ports: SwcGraphPort[];
  focusEntityId: string;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: PortTableColumnKey; direction: SortDirection }>({
    key: "portName",
    direction: "asc"
  });
  const columnResize = useResizableTableColumns(PORT_COLUMN_WIDTHS);

  const rows = useMemo(
    () =>
      props.ports.map((port) => ({
        port,
        portName: port.label,
        direction: formatPortDirectionLabel(port.direction, port.interfaceKind),
        isServicePort: formatBooleanMetadata(port.metadata?.["IS-SERVICE"]),
        interfaceName: formatReferenceShortName(port.interfaceRef),
        interfaceRef: port.interfaceRef ?? "-"
      })),
    [props.ports]
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.portName, row.direction, row.isServicePort, row.interfaceName, row.interfaceRef].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => comparePortRows(left, right, sort));
  }, [rows, searchQuery, sort]);

  const changeSort = (key: PortTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const openPortTab = (port: SwcGraphPort) => {
    props.onOpenWorkspaceTab?.({
      id: `${props.focusEntityId}:port:${port.id}`,
      title: `Port: ${port.label}`,
      kind: "port",
      focusEntityId: props.focusEntityId,
      entityId: port.id,
      xmlPath: port.xmlPath
    });
  };

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
        <label className="model-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter ports"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {props.ports.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table
            className="model-inspector-section-table model-semantic-table model-clickable-table"
            style={columnResize.tableStyle}
          >
            <colgroup>
              {columnResize.columnWidths.map((width, columnIndex) => (
                <col key={columnIndex} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "Port", key: "portName" as const },
                  { label: "Direction", key: "direction" as const },
                  { label: "Is Service Port", key: "isServicePort" as const },
                  { label: "Interface", key: "interfaceName" as const },
                  { label: "Interface Ref", key: "interfaceRef" as const }
                ].map((column, columnIndex) => (
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
              {visibleRows.map((row) => (
                <tr
                  key={row.port.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openPortTab(row.port)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPortTab(row.port);
                    }
                  }}
                >
                  <td>{row.portName}</td>
                  <td>{row.direction}</td>
                  <td>{row.isServicePort}</td>
                  <td title={row.interfaceRef}>{row.interfaceName}</td>
                  <td title={row.interfaceRef}>{row.interfaceRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching ports.</div>}
        </div>
      ) : (
        <div className="empty-state">No ports discovered.</div>
      )}
    </div>
  );
}
