import { useMemo, useState } from "react";
import type { SwcGraphPort } from "../../../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../../../EditorTabs/EditorTabs";
import { formatBooleanMetadata, formatReferenceShortName } from "../DetailsFormatters";
import { formatPortDirectionLabel } from "../PortDetails/CommunicationSpecHelper";
import { comparePortRows, normalizeTableSearch } from "./TableData";
import type { PortTableColumnKey, SortDirection } from "./TableData";
import { SortableTableHeader } from "./TableHeaders";

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
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                <SortableTableHeader label="Port" columnKey="portName" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Direction" columnKey="direction" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Is Service Port" columnKey="isServicePort" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Interface" columnKey="interfaceName" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Interface Ref" columnKey="interfaceRef" sort={sort} onSort={changeSort} />
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
