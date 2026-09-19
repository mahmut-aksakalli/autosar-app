import { useEffect, useRef } from "react";
import type { AutosarLogEntry } from "../../../../../../../src/shared/contracts";
import { formatLogTime, getLogEntryClassName } from "./OutputLogHelper";

export function OutputLog(props: { entries: AutosarLogEntry[]; isVisible: boolean }) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.isVisible || !outputRef.current) {
      return;
    }
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [props.entries.length, props.isVisible]);

  return (
    <div ref={outputRef} className="graph-output-log nowheel" role="log" aria-live="polite">
      {props.entries.length === 0 ? (
        <div className="graph-bottom-panel-empty">No output has been recorded.</div>
      ) : (
        props.entries.map((entry) => (
          <div key={entry.id} className={getLogEntryClassName(entry)}>
            <time dateTime={entry.timestamp}>{formatLogTime(entry.timestamp)}</time>
            <span className="graph-output-severity">{entry.severity}</span>
            <span className="graph-output-message">{entry.message}</span>
            {entry.details && <pre>{entry.details}</pre>}
          </div>
        ))
      )}
    </div>
  );
}
