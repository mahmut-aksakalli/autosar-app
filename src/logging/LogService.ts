import * as vscode from "vscode";
import type { AutosarLogEntry, Severity } from "../shared/contracts";
import type { AutosarLogger } from "./AutosarLogger";

const MAX_LOG_ENTRIES = 1_000;

/** Keeps recent extension logs in memory and publishes entries to the webview. */
export class LogService implements AutosarLogger, vscode.Disposable {
  private readonly entryEmitter = new vscode.EventEmitter<AutosarLogEntry>();
  private readonly entries: AutosarLogEntry[] = [];
  private nextEntryId = 1;

  readonly onDidAppend = this.entryEmitter.event;

  info(message: string) {
    this.append("info", message);
  }

  warning(message: string) {
    this.append("warning", message);
  }

  error(message: string, error?: unknown) {
    this.append("error", message, error ? formatError(error) : undefined);
  }

  getEntries() {
    return this.entries.slice();
  }

  dispose() {
    this.entryEmitter.dispose();
    this.entries.length = 0;
  }

  private append(severity: Severity, message: string, details?: string) {
    const entry: AutosarLogEntry = {
      id: String(this.nextEntryId++),
      timestamp: new Date().toISOString(),
      severity,
      message,
      details
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_LOG_ENTRIES);
    }
    this.entryEmitter.fire(entry);
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}
