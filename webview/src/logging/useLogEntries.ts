import { useEffect, useState } from "react";
import type { AutosarLogEntry } from "../../../src/shared/contracts";
import { modelHost } from "../vscodeApi";

const MAX_LOG_ENTRIES = 1_000;

/** Retains buffered extension logs and appends live entries from the host. */
export function useLogEntries(initialEntries: AutosarLogEntry[]) {
  const [entries, setEntries] = useState(() => initialEntries.slice(-MAX_LOG_ENTRIES));

  useEffect(() => {
    return modelHost.onMessage((message) => {
      if (message.type !== "logEntry") {
        return;
      }

      setEntries((current) => {
        if (current.some((entry) => entry.id === message.entry.id)) {
          return current;
        }
        return [...current, message.entry].slice(-MAX_LOG_ENTRIES);
      });
    });
  }, []);

  return entries;
}
