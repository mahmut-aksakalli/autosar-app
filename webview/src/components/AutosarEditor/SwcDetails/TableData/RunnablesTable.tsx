import { useMemo, useState } from "react";
import type { SwcInspectorItem } from "../../../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../../../EditorTabs/EditorTabs";
import { formatOptionalMilliseconds } from "../../../Common/Details/DetailsFormatters";
import { compareRunnableRows, normalizeTableSearch } from "./TableData";
import type { RunnableTableColumnKey, RunnableTableRow, SortDirection } from "./TableData";
import { SortableResizableTableHeader } from "../../../Common/Table/TableHeaders";
import { useResizableTableColumns } from "../../../Common/Table/useResizableTableColumns";

const RUNNABLE_COLUMN_WIDTHS = [220, 220, 220, 140];

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
  const columnResize = useResizableTableColumns(RUNNABLE_COLUMN_WIDTHS);

  // Convert parser-oriented inspector items into stable, display-ready rows.
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

  const openRunnableTab = (runnable: SwcInspectorItem) => {
    props.onOpenWorkspaceTab?.({
      id: `${props.focusEntityId}:runnable:${runnable.id}`,
      title: `Runnable: ${runnable.label}`,
      kind: "runnable",
      focusEntityId: props.focusEntityId,
      sectionId: "runnables",
      itemId: runnable.id,
      xmlPath: runnable.xmlPath
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
            placeholder="Filter runnables"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {props.runnables.length > 0 ? (
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
                  { label: "SWC name", key: "swcName" as const },
                  { label: "Runnable Name", key: "runnableName" as const },
                  { label: "Runnable Symbol", key: "runnableSymbol" as const },
                  { label: "Period", key: "period" as const }
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
                  key={row.runnable.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openRunnableTab(row.runnable)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRunnableTab(row.runnable);
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
