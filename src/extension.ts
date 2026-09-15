import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AutosarEntity, ModelWebviewToHostMessage, ModelWorkspaceTab } from "./shared/contracts";
import { GraphService } from "./model/graphService";
import { AutosarOutputLogger } from "./logger";
import { ModelTreeProvider, type ModelTreeNode } from "./model/modelTreeProvider";
import { WorkspaceModelService } from "./model/workspaceModelService";

export function activate(context: vscode.ExtensionContext) {
  const logger = new AutosarOutputLogger();
  const workspaceModelService = new WorkspaceModelService(logger);
  const graphService = new GraphService(workspaceModelService);
  const treeProvider = new ModelTreeProvider();
  const filterStorageKey = "autosarModelView.filterText";
  const initialFilterText = context.workspaceState.get(filterStorageKey, "");
  const treeView = vscode.window.createTreeView("autosarModelView.tree", {
    treeDataProvider: treeProvider
  });
  let filterView: vscode.WebviewView | undefined;
  let modelPanel: vscode.WebviewPanel | undefined;
  let initialWorkspaceIndexPromise: Promise<void> | undefined;

  context.subscriptions.push(
    logger,
    workspaceModelService,
    workspaceModelService.onUpdated((snapshot) => {
      treeProvider.update(snapshot);
      void modelPanel?.webview.postMessage({
        type: "workspaceUpdated",
        workspace: snapshot
      });
    }),
    workspaceModelService.onIndexingChanged((indexing) => {
      treeProvider.setIndexing(indexing);
    }),
    treeView,
    vscode.window.registerWebviewViewProvider("autosarModelView.filter", {
      resolveWebviewView(view) {
        filterView = view;
        view.webview.options = {
          enableScripts: true
        };
        view.webview.html = getFilterViewHtml(view.webview);
        view.onDidDispose(() => {
          if (filterView === view) {
            filterView = undefined;
          }
        });
        view.webview.onDidReceiveMessage((message: unknown) => {
          if (!isFilterChangedMessage(message)) {
            return;
          }
          setTreeFilter(message.value, { updateFilterView: false });
        });
        void view.webview.postMessage({
          type: "setFilter",
          value: treeProvider.getFilterText()
        });
      }
    }),
    vscode.commands.registerCommand("autosarModelView.open", async (entity?: AutosarEntity) => {
      const snapshot = workspaceModelService.getSnapshot() ?? (await workspaceModelService.refresh());
      treeProvider.update(snapshot);

      if (!snapshot) {
        vscode.window.showWarningMessage("Open a VS Code workspace folder before opening AUTOSAR Model View.");
        logger.warning("Open Model View requested without an open VS Code workspace folder.");
        return;
      }

      const focusEntity =
        entity ??
        snapshot.entities.find((candidate) => candidate.type === "composition") ??
        snapshot.entities.find((candidate) => candidate.type === "swc");
      const graph = await graphService.buildGraph({
        scope: focusEntity?.type === "composition" ? "composition" : "swc",
        focusId: focusEntity?.semanticPath ?? focusEntity?.id,
        depth: 1,
        includeCompositionInternals: focusEntity?.type === "composition"
      });
      void graph;
      openModelWebview(focusEntity?.id, makeGraphTab(focusEntity), snapshot);
    }),
    vscode.commands.registerCommand("autosarModelView.openFile", async (uri?: vscode.Uri) => {
      const fileUri = uri ?? getActiveArxmlEditorUri();
      const snapshot = await workspaceModelService.openFile(fileUri);
      treeProvider.update(snapshot);

      if (!snapshot) {
        return;
      }

      const focusEntity =
        snapshot.entities.find((candidate) => candidate.type === "composition") ??
        snapshot.entities.find((candidate) => candidate.type === "swc");
      const graph = await graphService.buildGraph({
        scope: focusEntity?.type === "composition" ? "composition" : "swc",
        focusId: focusEntity?.semanticPath ?? focusEntity?.id,
        depth: 1,
        includeCompositionInternals: focusEntity?.type === "composition"
      });
      void graph;
      openModelWebview(focusEntity?.id, makeGraphTab(focusEntity), snapshot);
    }),
    vscode.commands.registerCommand("autosarModelView.selectTreeNode", async (node: ModelTreeNode) => {
      const snapshot = workspaceModelService.getSnapshot();
      if (!snapshot || !node.selectable) {
        return;
      }

      const focusEntity = snapshot.entities.find((entity) => entity.id === node.focusEntityId);
      if (!focusEntity) {
        vscode.window.showWarningMessage(`Could not resolve AUTOSAR model node ${node.label}.`);
        logger.warning(`Could not resolve AUTOSAR model node: ${node.label}.`);
        return;
      }

      const tab = node.workspaceTab;
      if (tab?.kind === "graph") {
        const graph = await graphService.buildGraph({
          scope: tab.preferredScope ?? (focusEntity.type === "composition" ? "composition" : "swc"),
          focusId: focusEntity.semanticPath ?? focusEntity.id,
          depth: 1,
          includeCompositionInternals:
            tab.includeCompositionInternals === true ||
            focusEntity.type === "composition" ||
            Boolean(tab.preferredNodeId)
        });
        void graph;
        openModelWebview(focusEntity.id, tab, snapshot);
        return;
      }

      openModelWebview(focusEntity.id, tab, snapshot);
    }),
    vscode.commands.registerCommand("autosarModelView.refresh", async () => {
      const snapshot = await workspaceModelService.refreshCurrent();
      treeProvider.update(snapshot);
      if (snapshot) {
        vscode.window.showInformationMessage(
          `AUTOSAR model refreshed: ${snapshot.files.length} ARXML file(s), ${snapshot.entities.length} model entity/entities.`
        );
      }
    }),
    vscode.commands.registerCommand("autosarModelView.showSemanticTree", () => {
      treeProvider.setGroupingMode("semantic");
    }),
    vscode.commands.registerCommand("autosarModelView.showPackageTree", () => {
      treeProvider.setGroupingMode("packages");
    }),
    vscode.commands.registerCommand("autosarModelView.collapseAll", async () => {
      await vscode.commands.executeCommand("workbench.actions.treeView.autosarModelView.tree.collapseAll");
    })
  );

  setTreeFilter(initialFilterText);
  void ensureInitialWorkspaceIndexed();

  async function ensureInitialWorkspaceIndexed() {
    if (workspaceModelService.getSnapshot() || initialWorkspaceIndexPromise) {
      return initialWorkspaceIndexPromise;
    }

    initialWorkspaceIndexPromise = (async () => {
      try {
        const snapshot = await workspaceModelService.refresh();
        treeProvider.update(snapshot);
      } catch (error) {
        logger.error("Failed to index AUTOSAR model.", error);
        vscode.window.showErrorMessage(
          `Failed to index AUTOSAR model: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })();

    try {
      await initialWorkspaceIndexPromise;
    } finally {
      initialWorkspaceIndexPromise = undefined;
    }
  }

  function setTreeFilter(value: string, options: { updateFilterView?: boolean } = {}) {
    treeProvider.setFilterText(value);
    const filterText = treeProvider.getFilterText();
    treeView.description = filterText ? `Filter: ${filterText}` : undefined;
    void context.workspaceState.update(filterStorageKey, filterText || undefined);
    if (options.updateFilterView !== false) {
      void filterView?.webview.postMessage({
        type: "setFilter",
        value: filterText
      });
    }
  }

  function openModelWebview(
    focusEntityId: string | undefined,
    activeWorkspaceTab: ModelWorkspaceTab | undefined,
    snapshot = workspaceModelService.getSnapshot()
  ) {
    if (!snapshot) {
      return;
    }

    if (!modelPanel) {
      modelPanel = vscode.window.createWebviewPanel(
        "autosarModelView.model",
        "AUTOSAR Model",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
        }
      );
      modelPanel.onDidDispose(() => {
        modelPanel = undefined;
      });
      modelPanel.webview.onDidReceiveMessage((message: unknown) => {
        void handleWebviewMessage(modelPanel?.webview, message);
      });
      modelPanel.webview.html = getWebviewHtml(modelPanel.webview, context.extensionUri, {
        workspace: snapshot,
        focusEntityId,
        activeWorkspaceTab
      });
      return;
    }

    modelPanel.reveal(vscode.ViewColumn.One);
    void modelPanel.webview.postMessage({
      type: "focusModel",
      focusEntityId,
      activeWorkspaceTab
    });
  }

  async function handleWebviewMessage(webview: vscode.Webview | undefined, message: unknown) {
    if (webview && isRevealModelEntityMessage(message)) {
      const entity = workspaceModelService.getSnapshot()?.entities.find((candidate) => candidate.id === message.entityId);
      if (!entity || (entity.type !== "swc" && entity.type !== "composition")) {
        return;
      }
      let node = treeProvider.findEntityNode(entity.id);
      if (!node && treeProvider.getFilterText()) {
        setTreeFilter("");
        node = treeProvider.findEntityNode(entity.id);
      }
      if (node) {
        try {
          await treeView.reveal(node, { select: true, focus: false });
        } catch (error) {
          logger.error(`Failed to reveal AUTOSAR model entity ${entity.shortName}.`, error);
        }
      }
      return;
    }
    if (!webview || !isBuildGraphMessage(message)) {
      return;
    }

    try {
      const graph = await graphService.buildGraph(message.query);
      await webview.postMessage({
        type: "graphResult",
        requestId: message.requestId,
        graph
      });
    } catch (error) {
      await webview.postMessage({
        type: "graphError",
        requestId: message.requestId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function getWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    initialState: {
      workspace: NonNullable<ReturnType<WorkspaceModelService["getSnapshot"]>>;
      focusEntityId?: string;
      activeWorkspaceTab?: ModelWorkspaceTab;
    }
  ) {
    const mediaUri = vscode.Uri.joinPath(extensionUri, "media", "assets");
    const mediaPath = path.join(extensionUri.fsPath, "media", "assets");
    const files = fs.existsSync(mediaPath) ? fs.readdirSync(mediaPath) : [];
    const scriptFile = files.find((file) => file.endsWith(".js"));
    const styleFiles = files.filter((file) => file.endsWith(".css"));
    const scriptUri = scriptFile ? webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, scriptFile)) : undefined;
    const styleTags = styleFiles
      .map((file) => {
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, file));
        return `<link rel="stylesheet" href="${uri}">`;
      })
      .join("\n");
    const nonce = String(Date.now());
    const serializedState = JSON.stringify(initialState).replace(/</g, "\\u003c");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    ${styleTags}
    <title>AUTOSAR Model</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__AUTOSAR_INITIAL_STATE__ = ${serializedState};</script>
    ${scriptUri ? `<script nonce="${nonce}" type="module" src="${scriptUri}"></script>` : ""}
  </body>
</html>`;
  }

  function getFilterViewHtml(webview: vscode.Webview) {
    const nonce = String(Date.now());
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
      body {
        box-sizing: border-box;
        margin: 0;
        padding: 2px 6px 4px;
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        overflow: hidden;
      }
      .filter-row {
        display: flex;
        align-items: center;
        height: 22px;
      }
      input {
        flex: 1;
        min-width: 0;
        height: 22px;
        box-sizing: border-box;
        padding: 2px 6px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, transparent);
        outline: none;
      }
      input:focus {
        border-color: var(--vscode-focusBorder);
      }
    </style>
    <title>AUTOSAR Filter</title>
  </head>
  <body>
    <div class="filter-row">
      <input id="filter" type="search" placeholder="Filter AUTOSAR model" aria-label="Filter AUTOSAR model" autofocus>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const input = document.getElementById("filter");
      const previousState = vscode.getState();
      if (previousState && typeof previousState.filter === "string") {
        input.value = previousState.filter;
      }
      function postFilter() {
        vscode.setState({ filter: input.value });
        vscode.postMessage({ type: "filterChanged", value: input.value });
      }
      input.addEventListener("input", postFilter);
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (message && message.type === "setFilter" && input.value !== message.value) {
          input.value = message.value || "";
          vscode.setState({ filter: input.value });
        }
      });
    </script>
  </body>
</html>`;
  }
}

export function deactivate() {
  // No resources to dispose yet.
}

function getActiveArxmlEditorUri() {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (uri?.scheme === "file" && uri.fsPath.toLowerCase().endsWith(".arxml")) {
    return uri;
  }
  return undefined;
}

function makeGraphTab(entity: AutosarEntity | undefined): ModelWorkspaceTab | undefined {
  if (!entity) {
    return undefined;
  }
  const preferredScope = entity.type === "composition" ? "composition" : "swc";
  return {
    id: `${entity.id}:graph:main`,
    title: `Graph: ${entity.shortName}`,
    kind: "graph",
    focusEntityId: entity.id,
    preferredScope
  };
}

function isRevealModelEntityMessage(
  message: unknown
): message is Extract<ModelWebviewToHostMessage, { type: "revealModelEntity" }> {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "revealModelEntity" &&
    typeof (message as { entityId?: unknown }).entityId === "string"
  );
}

function isBuildGraphMessage(
  message: unknown
): message is Extract<ModelWebviewToHostMessage, { type: "buildGraph" }> {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as { type?: unknown; requestId?: unknown; query?: unknown };
  if (candidate.type !== "buildGraph" || typeof candidate.requestId !== "string") {
    return false;
  }
  if (!candidate.query || typeof candidate.query !== "object") {
    return false;
  }
  const query = candidate.query as Record<string, unknown>;
  return (
    (query.scope === "swc" || query.scope === "composition") &&
    typeof query.depth === "number" &&
    Number.isFinite(query.depth) &&
    query.depth >= 0 &&
    (query.focusId === undefined || typeof query.focusId === "string") &&
    (query.includeCompositionInternals === undefined || typeof query.includeCompositionInternals === "boolean")
  );
}

function isFilterChangedMessage(message: unknown): message is { type: "filterChanged"; value: string } {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "filterChanged" &&
    typeof (message as { value?: unknown }).value === "string"
  );
}
