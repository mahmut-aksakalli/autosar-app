import type { AutosarLogEntry } from "../../../../../../../src/shared/contracts";

export function formatLogTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString();
}

export function getLogEntryClassName(entry: AutosarLogEntry) {
  return `graph-output-entry is-${entry.severity}`;
}
