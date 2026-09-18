import type {
  HostToModelWebviewMessage,
  ModelWebviewToHostMessage,
  SwcGraphQuery,
  SwcGraphResult
} from "../../src/shared/contracts";

type VsCodeApi = {
  postMessage(message: ModelWebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type PendingRequest = {
  resolve: (value: SwcGraphResult) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const vscode = window.acquireVsCodeApi?.();
const pendingRequests = new Map<string, PendingRequest>();
const messageListeners = new Set<(message: HostToModelWebviewMessage) => void>();
const REQUEST_TIMEOUT_MS = 30_000;

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isHostMessage(event.data)) {
    return;
  }

  const message = event.data;
  if (message.type === "graphResult" || message.type === "graphError") {
    // requestId correlates an asynchronous host response with the Promise
    // returned to the graph-loading hook.
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      window.clearTimeout(pending.timeoutId);
      pendingRequests.delete(message.requestId);
      if (message.type === "graphResult") {
        pending.resolve(message.graph);
      } else {
        pending.reject(new Error(message.message));
      }
    }
  }

  messageListeners.forEach((listener) => listener(message));
});

window.addEventListener("beforeunload", () => {
  pendingRequests.forEach((pending) => {
    window.clearTimeout(pending.timeoutId);
    pending.reject(new Error("The AUTOSAR model view was closed."));
  });
  pendingRequests.clear();
});

export const modelHost = {
  buildGraph(query: SwcGraphQuery) {
    if (!vscode) {
      return Promise.reject(new Error("The VS Code host API is unavailable."));
    }

    const requestId = crypto.randomUUID();
    return new Promise<SwcGraphResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error("Timed out while building the AUTOSAR graph."));
      }, REQUEST_TIMEOUT_MS);
      pendingRequests.set(requestId, { resolve, reject, timeoutId });
      vscode.postMessage({ type: "buildGraph", requestId, query });
    });
  },

  revealModelEntity(entityId: string, treeNodeId?: string) {
    vscode?.postMessage({ type: "revealModelEntity", entityId, treeNodeId });
  },

  copyText(text: string) {
    vscode?.postMessage({ type: "copyText", text });
  },

  onMessage(listener: (message: HostToModelWebviewMessage) => void) {
    messageListeners.add(listener);
    return () => {
      messageListeners.delete(listener);
    };
  }
};

function isHostMessage(message: unknown): message is HostToModelWebviewMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Record<string, unknown>;
  switch (candidate.type) {
    case "focusModel":
      return isFocusModelMessage(candidate);
    case "workspaceUpdated":
      return isObject(candidate.workspace);
    case "graphResult":
      return isGraphResultMessage(candidate);
    case "graphError":
      return isGraphErrorMessage(candidate);
    default:
      return false;
  }
}

function isFocusModelMessage(candidate: Record<string, unknown>) {
  if (candidate.focusEntityId !== undefined && typeof candidate.focusEntityId !== "string") {
    return false;
  }
  if (candidate.activeWorkspaceTab !== undefined && !isObject(candidate.activeWorkspaceTab)) {
    return false;
  }
  return true;
}

function isGraphResultMessage(candidate: Record<string, unknown>) {
  if (typeof candidate.requestId !== "string") {
    return false;
  }
  if (!isObject(candidate.graph)) {
    return false;
  }
  return true;
}

function isGraphErrorMessage(candidate: Record<string, unknown>) {
  if (typeof candidate.requestId !== "string") {
    return false;
  }
  if (typeof candidate.message !== "string") {
    return false;
  }
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return true;
}
