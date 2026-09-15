import { useEffect, useMemo, useState } from "react";
import type {
  AutosarEntity,
  HostToModelWebviewMessage,
  ModelWebviewInitialState,
  SwcGraphScope,
  WorkspaceSnapshot
} from "../../src/shared/contracts";
import { ModelPanel } from "./model/ModelPanel";
import { EditorTabs } from "./tabs/EditorTabs";
import {
  makeDefaultModelGraphTab,
  makeModelTab,
  type ModelWorkspaceTab
} from "./tabs/modelWorkspaceTab";
import { useWorkspaceTabs } from "./tabs/workspaceTabsReducer";
import { modelHost } from "./vscodeApi";

declare global {
  interface Window {
    __AUTOSAR_INITIAL_STATE__: ModelWebviewInitialState;
  }
}

export function ModelWebviewApp() {
  const initialState = window.__AUTOSAR_INITIAL_STATE__;
  const [workspace, setWorkspace] = useState(initialState.workspace);
  const modelEntities = useMemo(() => getModelEntities(workspace), [workspace]);
  const [modelFocusEntityId, setModelFocusEntityId] = useState(() =>
    getInitialFocusEntityId(initialState, modelEntities)
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
    if (!entity) {
      return [];
    }
    return [makeDefaultModelGraphTab(entity, defaultScope(entity))];
  }, []);
  const tabs = useWorkspaceTabs(initialTabs, initialState.activeWorkspaceTab?.id);

  const activeModelFocusEntity = findActiveEntity(modelEntities, tabs.activeTab, modelFocusEntityId);
  const effectiveModelPreferredScope = getPreferredScope(
    tabs.activeTab,
    modelPreferredScope
  );

  useEffect(() => {
    // The extension owns the workspace snapshot. This listener translates host
    // events into local UI state and deliberately ignores response messages,
    // which are handled by modelHost itself.
    return modelHost.onMessage((message: HostToModelWebviewMessage) => {
      if (message.type === "workspaceUpdated") {
        setWorkspace(message.workspace);
        return;
      }

      if (message.type !== "focusModel") {
        return;
      }

      const targetEntity = findMessageTargetEntity(modelEntities, message);
      let tab = message.activeWorkspaceTab;
      if (!tab && targetEntity) {
        tab = makeDefaultModelGraphTab(targetEntity, defaultScope(targetEntity));
      }
      if (!targetEntity || !tab) {
        return;
      }

      setModelFocusEntityId(targetEntity.id);
      setModelPreferredScope(tab.preferredScope ?? defaultScope(targetEntity));
      setModelPreferredNodeId(tab.preferredNodeId);
      tabs.openTab(tab);
    });
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
    modelHost.revealModelEntity(targetEntity.id);
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
  if (entity?.type === "composition") {
    return "composition";
  }
  return "swc";
}

function getInitialFocusEntityId(
  initialState: ModelWebviewInitialState,
  entities: AutosarEntity[]
) {
  if (initialState.focusEntityId) {
    return initialState.focusEntityId;
  }
  if (initialState.activeWorkspaceTab?.focusEntityId) {
    return initialState.activeWorkspaceTab.focusEntityId;
  }
  return entities[0]?.id;
}

function findActiveEntity(
  entities: AutosarEntity[],
  activeTab: ModelWorkspaceTab | undefined,
  fallbackEntityId: string | undefined
) {
  if (activeTab) {
    const tabEntity = entities.find((entity) => entity.id === activeTab.focusEntityId);
    if (tabEntity) {
      return tabEntity;
    }
  }

  if (fallbackEntityId) {
    const fallbackEntity = entities.find((entity) => entity.id === fallbackEntityId);
    if (fallbackEntity) {
      return fallbackEntity;
    }
  }

  return entities[0];
}

function getPreferredScope(
  activeTab: ModelWorkspaceTab | undefined,
  fallbackScope: SwcGraphScope
) {
  if (activeTab?.preferredScope) {
    return activeTab.preferredScope;
  }
  return fallbackScope;
}

function findMessageTargetEntity(
  entities: AutosarEntity[],
  message: Extract<HostToModelWebviewMessage, { type: "focusModel" }>
) {
  return entities.find((entity) => {
    if (message.focusEntityId && entity.id === message.focusEntityId) {
      return true;
    }
    if (message.activeWorkspaceTab && entity.id === message.activeWorkspaceTab.focusEntityId) {
      return true;
    }
    return false;
  });
}
