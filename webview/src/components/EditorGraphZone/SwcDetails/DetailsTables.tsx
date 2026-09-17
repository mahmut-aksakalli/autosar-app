import { useMemo, useState } from "react";
import type { SwcGraphPort, SwcInspectorItem } from "../../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../../EditorTabs/EditorTabs";
import { comparePortRows, compareRunnableRows, compareTableText, normalizeTableSearch, SortableTableHeader } from "./DetailsTable";
import {
  formatBooleanMetadata,
  formatCalibrationAccess,
  formatInitValueTypeOption,
  formatOptionalMilliseconds,
  formatReferenceShortName
} from "./DetailsFormatters";
import { formatAssignedPortPrototypeColumn } from "./DetailsFormatters";
import { formatPortDirectionLabel } from "./PortDetails/CommunicationSpecHelper";
import type { DetailsTableItem, DetailsTableRow, PortTableColumnKey, RunnableTableColumnKey, RunnableTableRow, SortDirection } from "./DetailsTable";

export function RunnablesTable(props: {
  title: string;
  swcName: string;
  runnables: SwcInspectorItem[];
  focusEntityId: string;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: RunnableTableColumnKey; direction: SortDirection }>({
    key: "runnableName",
    direction: "asc"
  });
  // Convert parser-oriented inspector items into stable, display-ready rows.
  // Search and sorting below can then operate without knowing AUTOSAR metadata keys.
  const rows = useMemo<RunnableTableRow[]>(
    () =>
      props.runnables.map((runnable) => ({
        runnable,
        swcName: props.swcName,
        runnableName: runnable.label,
        runnableSymbol: runnable.metadata?.SYMBOL ?? "-",
        period: formatOptionalMilliseconds(runnable.metadata?.PERIOD),
        periodSortValue: Number(runnable.metadata?.PERIOD)
      })),
    [props.runnables, props.swcName]
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.swcName, row.runnableName, row.runnableSymbol, row.period].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => compareRunnableRows(left, right, sort));
  }, [rows, searchQuery, sort]);

  const changeSort = (key: RunnableTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
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
            placeholder="Filter runnables"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {props.runnables.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                <SortableTableHeader
                  label="SWC name"
                  columnKey="swcName"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortableTableHeader
                  label="Runnable Name"
                  columnKey="runnableName"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortableTableHeader
                  label="Runnable Symbol"
                  columnKey="runnableSymbol"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortableTableHeader
                  label="Period"
                  columnKey="period"
                  sort={sort}
                  onSort={changeSort}
                />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.runnable.id}
                  tabIndex={0}
                  role="button"
                  onClick={() =>
                    props.onOpenWorkspaceTab?.({
                      id: `${props.focusEntityId}:runnable:${row.runnable.id}`,
                      title: `Runnable: ${row.runnable.label}`,
                      kind: "runnable",
                      focusEntityId: props.focusEntityId,
                      sectionId: "runnables",
                      itemId: row.runnable.id,
                      xmlPath: row.runnable.xmlPath
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onOpenWorkspaceTab?.({
                        id: `${props.focusEntityId}:runnable:${row.runnable.id}`,
                        title: `Runnable: ${row.runnable.label}`,
                        kind: "runnable",
                        focusEntityId: props.focusEntityId,
                        sectionId: "runnables",
                        itemId: row.runnable.id,
                        xmlPath: row.runnable.xmlPath
                      });
                    }
                  }}
                >
                  <td>{row.swcName}</td>
                  <td>{row.runnableName}</td>
                  <td>{row.runnableSymbol}</td>
                  <td>{row.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching runnables.</div>}
        </div>
      ) : (
        <div className="empty-state">No runnables discovered.</div>
      )}
    </div>
  );
}

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
  // Resolve presentation labels once instead of repeating reference parsing in
  // every render branch and table cell.
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

export function DetailsItemsTable(props: {
  title: string;
  items: DetailsTableItem[];
  focusEntityId: string;
  detailKind: "parameter" | "interRunnableVariable" | "perInstanceMemoryItem" | "serviceDependency";
  detailTitlePrefix: string;
  emptyLabel: string;
  filterPlaceholder: string;
  columns: Array<{ key: string; label: string }>;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({
    key: props.columns[0]?.key ?? "label",
    direction: "asc"
  });
  // Detail sections have different metadata columns. Flattening metadata into
  // the row keeps the generic table implementation independent of each section.
  const rows = useMemo<DetailsTableRow[]>(
    () =>
      props.items.map((entry) => {
        const metadata = entry.item.metadata ?? {};
        return {
          id: `${entry.sectionId}:${entry.item.id}`,
          item: entry.item,
          sectionId: entry.sectionId,
          section: entry.sectionLabel,
          label: entry.item.label,
          filePath: entry.filePath,
          xmlPath: entry.item.xmlPath,
          ...metadata,
          TYPE: formatReferenceShortName(metadata.TYPE),
          "ASSIGNED-PORT-PROTOTYPE": formatAssignedPortPrototypeColumn(
            entry.item.details?.assignedPorts ?? [],
            metadata["ASSIGNED-PORTS"]
          ),
          "INITIAL-VALUE-TYPE": formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-"),
          SCOPE: metadata.SCOPE ?? "-",
          "SW-CALIBRATION-ACCESS": formatCalibrationAccess(metadata["SW-CALIBRATION-ACCESS"])
        };
      }),
    [props.items]
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? props.columns.some((column) => normalizeTableSearch(String(row[column.key] ?? "")).includes(normalizedQuery))
          : true
      )
      .sort((left, right) => {
        const direction = sort.direction === "asc" ? 1 : -1;
        return direction * compareTableText(String(left[sort.key] ?? ""), String(right[sort.key] ?? ""));
      });
  }, [props.columns, rows, searchQuery, sort]);

  const changeSort = (key: string) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const openItemTab = (row: DetailsTableRow) => {
    props.onOpenWorkspaceTab?.({
      id: `${props.focusEntityId}:${props.detailKind}:${row.sectionId}:${row.item.id}`,
      title: `${props.detailTitlePrefix}: ${row.item.label}`,
      kind: props.detailKind,
      focusEntityId: props.focusEntityId,
      sectionId: row.sectionId,
      itemId: row.item.id,
      xmlPath: row.item.xmlPath
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
            placeholder={props.filterPlaceholder}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {props.items.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                {props.columns.map((column) => (
                  <SortableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openItemTab(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openItemTab(row);
                    }
                  }}
                >
                  {props.columns.map((column) => (
                    <td key={column.key}>{String(row[column.key] ?? "-") || "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching items.</div>}
        </div>
      ) : (
        <div className="empty-state">{props.emptyLabel}</div>
      )}
    </div>
  );
}

export function DetailsTable(props: {
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
