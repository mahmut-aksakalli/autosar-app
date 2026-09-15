import { useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  RunnableAccessPointDetail,
  RunnableActivationReasonDetail,
  RunnableTriggerEventDetail,
  SwcInspectorItem
} from "../../../src/shared/contracts";
import {
  compareAccessPointRows,
  compareTriggerEventRows,
  formatTimeInterval,
  normalizeTableSearch,
  readBooleanMetadata,
  SortableResizableTableHeader,
  splitMetadataList,
  stringifyAccessPointCell
} from "./SemanticSurfaces";
import type {
  AccessPointTableColumnKey,
  SortDirection,
  TriggerEventTableColumnKey
} from "./SemanticSurfaces";

export function ModelRunnableSurface(props: {
  title: string;
  runnable?: SwcInspectorItem;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, runnable } = props;
  const concurrent = readBooleanMetadata(runnable?.metadata?.CONCURRENT);
  const activationReasonDetails = runnable?.details?.activationReasons ?? [];
  const accessPoints = splitMetadataList(runnable?.metadata?.["ACCESS-POINTS"]);
  const accessPointDetails = runnable?.details?.accessPoints ?? [];
  const triggerEvents = splitMetadataList(runnable?.metadata?.["TRIGGER-EVENTS"]);
  const triggerEventDetails = runnable?.details?.triggerEvents ?? [];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-runnable-detail">
        <div className="model-semantic-kv model-runnable-fields">
          <div>
            <span>Name</span>
            <strong>{runnable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Symbol</span>
            <strong>{runnable?.metadata?.SYMBOL ?? "-"}</strong>
          </div>
          <div>
            <span>Can Be Invoked Concurrently</span>
            <strong>
              <input type="checkbox" checked={concurrent === true} disabled readOnly />
            </strong>
          </div>
          <div>
            <span>Minimum Start Interval</span>
            <strong>{formatTimeInterval(runnable?.metadata?.["MIN-START-INTERVAL"])}</strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{runnable?.metadata?.["SW-ADDR-METHOD-REF"] ?? "-"}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{runnable?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>
        <ModelRunnableTriggerEventsTable details={triggerEventDetails} fallbackItems={triggerEvents} />
        <ModelRunnableAccessPointsTable details={accessPointDetails} fallbackItems={accessPoints} />
        <ModelRunnableActivationReasonsTable details={activationReasonDetails} />
      </div>
    </div>
  );
}

function ModelRunnableActivationReasonsTable(props: { details: RunnableActivationReasonDetail[] }) {
  const { details } = props;

  return (
    <section className="model-list-section model-activation-reasons-section">
      <h3>Activation Reasons</h3>
      {details.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th style={{ width: "90px" }}>Bit</th>
                <th>Name</th>
                <th>Symbol</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row, index) => (
                <tr key={`${row.bit}:${row.name}:${row.symbol}:${index}`}>
                  <td title={row.bit}>{row.bit}</td>
                  <td title={row.name}>{row.name}</td>
                  <td title={row.symbol}>{row.symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No activation reasons discovered.</div>
      )}
    </section>
  );
}

function ModelRunnableAccessPointsTable(props: { details: RunnableAccessPointDetail[]; fallbackItems: string[] }) {
  const { details, fallbackItems } = props;
  const [columnWidths, setColumnWidths] = useState([280, 180, 260]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: AccessPointTableColumnKey; direction: SortDirection }>({
    key: "target",
    direction: "asc"
  });
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          target: "-",
          access: "-",
          name: item
        }));
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.target, row.access, row.name].some((value) => normalizeTableSearch(value).includes(normalizedQuery))
          : true
      )
      .sort((left, right) => compareAccessPointRows(left, right, sort));
  }, [rows, searchQuery, sort]);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const changeSort = (key: AccessPointTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex] ?? 180;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((currentWidths) =>
        currentWidths.map((width, index) => (index === columnIndex ? Math.max(120, startWidth + delta) : width))
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <section className="model-list-section model-access-points-section">
      <div className="model-list-section-header">
        <button
          type="button"
          className="model-list-section-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="model-list-section-chevron" aria-hidden="true" />
          <span>Access Points</span>
          <span className="model-list-section-count">{visibleRows.length}</span>
        </button>
        <label className="model-table-search model-list-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter access points"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {isExpanded && rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table"
            style={{ "--model-runnable-table-width": `${tableWidth}px` } as CSSProperties}
          >
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "DEP / Operation / Trigger", key: "target" as const },
                  { label: "Access", key: "access" as const },
                  { label: "Name", key: "name" as const }
                ].map((column, index) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => startColumnResize(event, index)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.name}:${row.access}:${row.target}:${index}`}>
                  <td title={row.target}>{row.target}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching access points.</div>}
        </div>
      ) : isExpanded ? (
        <div className="model-list-empty">No items discovered.</div>
      ) : null}
    </section>
  );
}

function ModelRunnableTriggerEventsTable(props: { details: RunnableTriggerEventDetail[]; fallbackItems: string[] }) {
  const { details, fallbackItems } = props;
  const [columnWidths, setColumnWidths] = useState([220, 180, 180, 180, 240]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: TriggerEventTableColumnKey; direction: SortDirection }>({
    key: "trigger",
    direction: "asc"
  });
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          trigger: "-",
          type: "-",
          disabledInModes: "-",
          activationReason: "-",
          name: item
        }));
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.trigger, row.type, row.disabledInModes, row.activationReason, row.name].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => compareTriggerEventRows(left, right, sort));
  }, [rows, searchQuery, sort]);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const changeSort = (key: TriggerEventTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex] ?? 180;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((currentWidths) =>
        currentWidths.map((width, index) => (index === columnIndex ? Math.max(120, startWidth + delta) : width))
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <section className="model-list-section model-trigger-events-section">
      <div className="model-list-section-header">
        <button
          type="button"
          className="model-list-section-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="model-list-section-chevron" aria-hidden="true" />
          <span>Trigger Events</span>
          <span className="model-list-section-count">{visibleRows.length}</span>
        </button>
        <label className="model-table-search model-list-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter trigger events"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {isExpanded && rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table"
            style={{ "--model-runnable-table-width": `${tableWidth}px` } as CSSProperties}
          >
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "Trigger", key: "trigger" as const },
                  { label: "Type", key: "type" as const },
                  { label: "Disable in modes", key: "disabledInModes" as const },
                  { label: "Activation Reason", key: "activationReason" as const },
                  { label: "Name", key: "name" as const }
                ].map((column, index) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => startColumnResize(event, index)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.name}:${row.type}:${row.trigger}:${index}`}>
                  <td title={row.trigger}>{row.trigger}</td>
                  <td title={row.type}>{row.type}</td>
                  <td title={row.disabledInModes}>{row.disabledInModes}</td>
                  <td title={row.activationReason}>{row.activationReason}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching trigger events.</div>}
        </div>
      ) : isExpanded ? (
        <div className="model-list-empty">No items discovered.</div>
      ) : null}
    </section>
  );
}
