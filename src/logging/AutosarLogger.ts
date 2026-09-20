export interface AutosarLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string, error?: unknown): void;
}

export const noopAutosarLogger: AutosarLogger = {
  info: () => undefined,
  warning: () => undefined,
  error: () => undefined
};
