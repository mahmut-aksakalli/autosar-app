import type { SwcGraphQuery, SwcGraphResult } from "./shared/contracts";

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type PendingRequest = {
  resolve: (value: SwcGraphResult) => void;
  reject: (reason?: unknown) => void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    autosarApi: {
      buildGraph(query: SwcGraphQuery): Promise<SwcGraphResult>;
    };
  }
}

const vscode = window.acquireVsCodeApi?.();
const pendingRequests = new Map<string, PendingRequest>();

window.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as
    | { type: "graphResult"; requestId: string; graph: SwcGraphResult }
    | { type: "graphError"; requestId: string; message: string };

  if (message.type !== "graphResult" && message.type !== "graphError") {
    return;
  }

  const pending = pendingRequests.get(message.requestId);
  if (!pending) {
    return;
  }

  pendingRequests.delete(message.requestId);
  if (message.type === "graphResult") {
    pending.resolve(message.graph);
  } else {
    pending.reject(new Error(message.message));
  }
});

window.autosarApi = {
  buildGraph(query) {
    const requestId = crypto.randomUUID();
    return new Promise<SwcGraphResult>((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
      vscode?.postMessage({
        type: "buildGraph",
        requestId,
        query
      });
    });
  }
};

export { vscode };
