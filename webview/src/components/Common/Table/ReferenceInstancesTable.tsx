import { useMemo, useState } from "react";
import type { EntityReferenceInstance } from "../../../../../src/shared/contracts";
import { SortableResizableTableHeader } from "./TableHeaders";
import { useResizableTableColumns } from "./useResizableTableColumns";

type InstanceColumnKey =
  | "instanceName"
  | "instanceType"
  | "referencingObjectName";
type SortDirection = "asc" | "desc";

const INSTANCE_COLUMN_WIDTHS = [220, 260, 260];
const INSTANCE_COLUMNS: Array<{ key: InstanceColumnKey; label: string }> = [
  { key: "instanceName", label: "Instance Name" },
  { key: "instanceType", label: "Instance Type" },
  { key: "referencingObjectName", label: "Referencing Object" }
];

export function ReferenceInstancesTable(props: {
  instances: EntityReferenceInstance[];
  onInstanceSelect?: (instance: EntityReferenceInstance) => void;
}) {
  const [sort, setSort] = useState<{ key: InstanceColumnKey; direction: SortDirection }>({
    key: "instanceName",
    direction: "asc"
  });
  const columnResize = useResizableTableColumns(INSTANCE_COLUMN_WIDTHS);
  const sortedInstances = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...props.instances].sort((left, right) => {
      return direction * left[sort.key].localeCompare(right[sort.key]);
    });
  }, [props.instances, sort]);

  function changeSort(key: InstanceColumnKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  return (
    <section className="model-port-argument-section model-reference-instances-section">
      <h3>Instances</h3>
      {sortedInstances.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table model-clickable-table"
            style={columnResize.tableStyle}
          >
            <colgroup>
              {columnResize.columnWidths.map((width, columnIndex) => (
                <col key={INSTANCE_COLUMNS[columnIndex]?.key ?? columnIndex} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {INSTANCE_COLUMNS.map((column, columnIndex) => (
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
              {sortedInstances.map((instance) => (
                <tr
                  key={instance.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => props.onInstanceSelect?.(instance)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onInstanceSelect?.(instance);
                    }
                  }}
                >
                  <td title={instance.instanceName}>{instance.instanceName}</td>
                  <td title={instance.instanceType}>{formatAutosarName(instance.instanceType)}</td>
                  <td title={instance.referencingObjectName}>
                    {instance.referencingObjectName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No instances discovered.</div>
      )}
    </section>
  );
}

function formatAutosarName(value: string) {
  return value
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
