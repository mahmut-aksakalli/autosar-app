import { useMemo, useState } from "react";
import type { SwcInstanceReference } from "../../../../../../../src/shared/contracts";
import { SortableTableHeader } from "../../../../Common/Table/TableHeaders";
import {
  filterAndSortInstances,
  type InstanceColumnKey,
  type SortDirection
} from "./InstancesTableHelper";

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
        <table className="graph-bottom-panel-table graph-instance-table">
          <thead>
            <tr>
              <SortableTableHeader label="Instance" columnKey="instanceName" sort={sort} onSort={changeSort} />
              <SortableTableHeader
                label="Parent Composition"
                columnKey="parentCompositionName"
                sort={sort}
                onSort={changeSort}
              />
              <SortableTableHeader label="Instance Path" columnKey="instancePath" sort={sort} onSort={changeSort} />
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
