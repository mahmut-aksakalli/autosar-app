import type { AriaAttributes, PointerEvent as ReactPointerEvent } from "react";
import "./TableHeaders.css";

type SortDirection = "asc" | "desc";

function getAriaSort(isActive: boolean, direction: SortDirection): AriaAttributes["aria-sort"] {
  if (!isActive) {
    return "none";
  }

  if (direction === "asc") {
    return "ascending";
  }

  return "descending";
}

export function SortableTableHeader<Key extends string>(props: {
  label: string;
  columnKey: Key;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key) => void;
}) {
  const isActive = props.sort.key === props.columnKey;
  const indicatorClass = isActive ? `is-${props.sort.direction}` : "is-unsorted";
  const ariaSort = getAriaSort(isActive, props.sort.direction);

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button
        type="button"
        className="model-sort-header-button"
        onClick={() => props.onSort(props.columnKey)}
        title={`Sort by ${props.label}`}
      >
        <span>{props.label}</span>
        <span className={`model-sort-indicator ${indicatorClass}`} aria-hidden="true" />
      </button>
    </th>
  );
}

export function SortableResizableTableHeader<Key extends string>(props: {
  label: string;
  columnKey: Key;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key) => void;
  onResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const isActive = props.sort.key === props.columnKey;
  const indicatorClass = isActive ? `is-${props.sort.direction}` : "is-unsorted";
  const ariaSort = getAriaSort(isActive, props.sort.direction);

  return (
    <th aria-sort={ariaSort}>
      <button
        type="button"
        className="model-sort-header-button"
        onClick={() => props.onSort(props.columnKey)}
        title={`Sort by ${props.label}`}
      >
        <span>{props.label}</span>
        <span className={`model-sort-indicator ${indicatorClass}`} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="model-runnable-column-resizer"
        aria-label={`Resize ${props.label} column`}
        onPointerDown={props.onResize}
      />
    </th>
  );
}
