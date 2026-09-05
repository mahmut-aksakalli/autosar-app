import * as vscode from "vscode";

export interface AutosarLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string, error?: unknown): void;
}

export class AutosarOutputLogger implements AutosarLogger, vscode.Disposable {
  private readonly outputChannel = vscode.window.createOutputChannel("AUTOSAR Model View");

  info(message: string) {
    this.append("info", message);
  }

  warning(message: string) {
    this.append("warning", message);
  }

  error(message: string, error?: unknown) {
    this.append("error", message);
    if (error) {
      this.outputChannel.appendLine(formatError(error));
    }
  }

  dispose() {
    this.outputChannel.dispose();
  }

  private append(category: "info" | "warning" | "error", message: string) {
    this.outputChannel.appendLine(`${new Date().toISOString()} [${category}] ${message}`);
  }
}

export const noopAutosarLogger: AutosarLogger = {
  info: () => undefined,
  warning: () => undefined,
  error: () => undefined
};

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}
