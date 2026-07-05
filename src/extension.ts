import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AutosarEntity } from "./shared/contracts";
import { GraphService } from "./model/graphService";
import { ModelTreeProvider, type ModelTreeNode, type ModelWorkspaceTab } from "./model/modelTreeProvider";
import { WorkspaceModelService } from "./model/workspaceModelService";

export function activate(context: vscode.ExtensionContext) {
  const workspaceModelService = new WorkspaceModelService();
  const graphService = new GraphService(workspaceModelService);
  const treeProvider = new ModelTreeProvider();
  let modelPanel: vscode.WebviewPanel | undefined;
  let initialWorkspaceIndexPromise: Promise<void> | undefined;

  context.subscriptions.push(
    workspaceModelService,
    workspaceModelService.onUpdated((snapshot) => {
      treeProvider.update(snapshot);
      void modelPanel?.webview.postMessage({
        type: "workspaceUpdated",
        workspace: snapshot
      });
    }),
    vscode.window.registerTreeDataProvider("autosarModelView.tree", treeProvider),
    vscode.commands.registerCommand("autosarModelView.open", async (entity?: AutosarEntity) => {
      const snapshot = workspaceModelService.getSnapshot() ?? (await workspaceModelService.refresh());
      treeProvider.update(snapshot);

      if (!snapshot) {
        vscode.window.showWarningMessage("Open a VS Code workspace folder before opening AUTOSAR Model View.");
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
    })
  );

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

function isBuildGraphMessage(message: unknown): message is {
  type: "buildGraph";
  requestId: string;
  query: Parameters<GraphService["buildGraph"]>[0];
} {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "buildGraph" &&
    typeof (message as { requestId?: unknown }).requestId === "string"
  );
}
