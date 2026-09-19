import { useMemo, useState } from "react";
import type { SwcInstanceReference } from "../../../../../../../src/shared/contracts";
import { SortableResizableTableHeader } from "../../../../Common/Table/TableHeaders";
import { useResizableTableColumns } from "../../../../Common/Table/useResizableTableColumns";
import {
  filterAndSortInstances,
  type InstanceColumnKey,
  type SortDirection
} from "./InstancesTableHelper";

const INSTANCE_COLUMN_WIDTHS = [180, 220, 360];

export function InstancesTable(props: {
  instances: SwcInstanceReference[];
  activeInstanceId?: string;
  onInstanceSelect: (instance: SwcInstanceReference) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: InstanceColumnKey; direction: SortDirection }>({
    key: "instanceName",
    direction: "asc"
  });
  const columnResize = useResizableTableColumns(INSTANCE_COLUMN_WIDTHS);
  const visibleInstances = useMemo(
    () => filterAndSortInstances(props.instances, searchQuery, sort),
    [props.instances, searchQuery, sort]
  );

  function changeSort(key: InstanceColumnKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  return (
    <div className="graph-instances-tab">
      <label className="graph-bottom-panel-search">
        <span>Search</span>
        <input
          type="search"
          value={searchQuery}
          placeholder="Filter SWC instances"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>
      <div className="graph-bottom-panel-table-scroll nowheel">
        <table
          className="graph-bottom-panel-table graph-instance-table"
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
                { label: "Instance", key: "instanceName" as const },
                { label: "Parent Composition", key: "parentCompositionName" as const },
                { label: "Instance Path", key: "instancePath" as const }
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
            {visibleInstances.map((instance) => {
              const isActive = instance.id === props.activeInstanceId;
              return (
                <tr
                  key={`${instance.parentCompositionId}:${instance.id}`}
                  className={isActive ? "is-selected" : undefined}
                  aria-selected={isActive}
                  tabIndex={0}
                  role="button"
                  onClick={() => props.onInstanceSelect(instance)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onInstanceSelect(instance);
                    }
                  }}
                >
                  <td>{instance.instanceName}</td>
                  <td>{instance.parentCompositionName}</td>
                  <td title={instance.instancePath}>{instance.instancePath ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {props.instances.length === 0 && (
          <div className="graph-bottom-panel-empty">No instances of this SWC were discovered.</div>
        )}
        {props.instances.length > 0 && visibleInstances.length === 0 && (
          <div className="graph-bottom-panel-empty">No matching instances.</div>
        )}
      </div>
    </div>
  );
}
