import { useMemo, useState } from "react";
import type { ModelWorkspaceTab } from "../../../EditorTabs/EditorTabs";
import {
  formatAssignedPortPrototypeColumn,
  formatCalibrationAccess,
  formatInitValueTypeOption,
  formatReferenceShortName
} from "../DetailsFormatters";
import { compareTableText, normalizeTableSearch } from "./TableData";
import type { DetailsTableItem, DetailsTableRow, SortDirection } from "./TableData";
import { SortableTableHeader } from "../../../Common/Table/TableHeaders";

export function VariablesTable(props: {
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
  // each row keeps this table independent of the individual section schemas.
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
