import { useEffect, useMemo, useState } from "react";
import type { AutosarEntity, SwcGraphScope, WorkspaceSnapshot } from "./shared/contracts";
import { ModelPanel } from "./model/ModelPanel";
import { EditorTabs } from "./tabs/EditorTabs";
import {
  makeDefaultModelGraphTab,
  makeModelTab,
  type ModelWorkspaceTab
} from "./tabs/modelWorkspaceTab";
import { useWorkspaceTabs } from "./tabs/workspaceTabsReducer";
import { vscode } from "./vscodeApi";

interface InitialState {
  workspace: WorkspaceSnapshot;
  focusEntityId?: string;
  activeWorkspaceTab?: ModelWorkspaceTab;
}

declare global {
  interface Window {
    __AUTOSAR_INITIAL_STATE__: InitialState;
  }
}

export function ModelWebviewApp() {
  const initialState = window.__AUTOSAR_INITIAL_STATE__;
  const [workspace, setWorkspace] = useState(initialState.workspace);
  const modelEntities = useMemo(() => getModelEntities(workspace), [workspace]);
  const [modelFocusEntityId, setModelFocusEntityId] = useState(
    initialState.focusEntityId ?? initialState.activeWorkspaceTab?.focusEntityId ?? modelEntities[0]?.id
  );
  const [modelPreferredScope, setModelPreferredScope] = useState<SwcGraphScope>(
    initialState.activeWorkspaceTab?.preferredScope ?? "swc"
  );
  const [modelPreferredNodeId, setModelPreferredNodeId] = useState<string | undefined>(
    initialState.activeWorkspaceTab?.preferredNodeId
  );
  const initialTabs = useMemo(() => {
    if (initialState.activeWorkspaceTab) {
      return [initialState.activeWorkspaceTab];
    }
    const entity = modelEntities[0];
    return entity ? [makeDefaultModelGraphTab(entity, defaultScope(entity))] : [];
  }, []);
  const tabs = useWorkspaceTabs(initialTabs, initialState.activeWorkspaceTab?.id);

  const activeModelFocusEntity =
    modelEntities.find((entity) => entity.id === tabs.activeTab?.focusEntityId) ??
    modelEntities.find((entity) => entity.id === modelFocusEntityId) ??
    modelEntities[0];
  const effectiveModelPreferredScope =
    tabs.activeTab?.preferredScope ?? modelPreferredScope ?? defaultScope(activeModelFocusEntity);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as
        | { type: "focusModel"; focusEntityId?: string; activeWorkspaceTab?: ModelWorkspaceTab }
        | { type: "workspaceUpdated"; workspace?: WorkspaceSnapshot }
        | { type: string };

      if (message.type === "workspaceUpdated") {
        if (message.workspace) {
          setWorkspace(message.workspace);
        }
        return;
      }

      if (message.type !== "focusModel") {
        return;
      }

      const targetEntity = modelEntities.find(
        (entity) => entity.id === message.focusEntityId || entity.id === message.activeWorkspaceTab?.focusEntityId
      );
      const tab = message.activeWorkspaceTab ??
        (targetEntity ? makeDefaultModelGraphTab(targetEntity, defaultScope(targetEntity)) : undefined);
      if (!targetEntity || !tab) {
        return;
      }

      setModelFocusEntityId(targetEntity.id);
      setModelPreferredScope(tab.preferredScope ?? defaultScope(targetEntity));
      setModelPreferredNodeId(tab.preferredNodeId);
      tabs.openTab(tab);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [modelEntities, tabs.openTab]);

  function focusModelEntityFromGraph(selection: ModelEntitySelection) {
    const targetEntity = modelEntities.find(
      (entity) =>
        entity.id === selection.entityId ||
        entity.semanticPath === selection.semanticPath ||
        entity.shortName === selection.semanticPath
    );
    if (!targetEntity) {
      return;
    }

    const preferredScope = selection.preferredScope ?? defaultScope(targetEntity);
    tabs.openTab(makeModelTab(targetEntity, "graph", "Graph", {
      preferredScope,
      preferredNodeId: selection.preferredNodeId,
      includeCompositionInternals: selection.includeCompositionInternals
    }));
    setModelFocusEntityId(targetEntity.id);
    setModelPreferredScope(preferredScope);
    setModelPreferredNodeId(selection.preferredNodeId);
    vscode?.postMessage({ type: "revealModelEntity", entityId: targetEntity.id });
  }

  if (!activeModelFocusEntity || !tabs.activeTab) {
    return <div className="empty-state">No AUTOSAR model entity was discovered.</div>;
  }

  return (
    <div className="webview-model-shell">
      <EditorTabs
        tabs={tabs.tabs}
        activeTabId={tabs.activeTab.id}
        onActivate={tabs.activateTab}
        onPin={(tab) => tabs.openTab(tab, true)}
        onClose={tabs.closeTab}
      />
      <div className="editor-view">
        <ModelPanel
          focusEntity={activeModelFocusEntity}
          workspaceRevision={workspace.lastIndexedAt}
          preferredScope={effectiveModelPreferredScope}
          preferredNodeId={tabs.activeTab.preferredNodeId ?? modelPreferredNodeId}
          activeWorkspaceTab={tabs.activeTab}
          onFocusModelEntity={focusModelEntityFromGraph}
          onOpenWorkspaceTab={tabs.openTab}
        />
      </div>
    </div>
  );
}

interface ModelEntitySelection {
  entityId?: string;
  semanticPath?: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  includeCompositionInternals?: boolean;
}

function getModelEntities(workspace: WorkspaceSnapshot) {
  return workspace.entities
    .filter((entity) => !["port", "instance", "connection", "generic"].includes(entity.type))
    .slice()
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
}

function defaultScope(entity: AutosarEntity | undefined): SwcGraphScope {
  return entity?.type === "composition" ? "composition" : "swc";
}
