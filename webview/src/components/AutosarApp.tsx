import { useEffect, useMemo, useState } from "react";
import "./AutosarApp.css";
import type {
  AutosarEntity,
  HostToModelWebviewMessage,
  ModelWebviewInitialState,
  SwcGraphPort,
  SwcGraphScope,
  SwcInstanceReference,
  WorkspaceSnapshot
} from "../../../src/shared/contracts";
import { EditorGraphZone } from "./EditorGraphZone/EditorGraphZone";
import type { BottomPanelTab } from "./EditorGraphZone/AutosarSwc/BottomPanel/BottomPanel";
import type { SwcNodeView } from "./EditorGraphZone/AutosarSwc/AutosarSwcLayout";
import { EditorTabs } from "./EditorTabs/EditorTabsView";
import {
  makeDefaultModelGraphTab,
  makeModelTab,
  type ModelWorkspaceTab
} from "./EditorTabs/EditorTabs";
import { useWorkspaceTabs } from "./EditorTabs/EditorTabsHelper";
import { modelHost } from "../vscodeApi";
import { useLogEntries } from "../logging/useLogEntries";

declare global {
  interface Window {
    __AUTOSAR_INITIAL_STATE__: ModelWebviewInitialState;
  }
}

export function AutosarApp() {
  const initialState = window.__AUTOSAR_INITIAL_STATE__;
  const [workspace, setWorkspace] = useState(initialState.workspace);
  const logEntries = useLogEntries(initialState.logEntries ?? []);
  const [activeBottomPanelTab, setActiveBottomPanelTab] = useState<BottomPanelTab>("output");
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
  const activePreferredNodeId = tabs.activeTab?.preferredNodeId ?? modelPreferredNodeId;
  const visibleSwcInstances = useMemo(
    () => getVisibleSwcInstances(workspace, activeModelFocusEntity, activePreferredNodeId),
    [activeModelFocusEntity, activePreferredNodeId, workspace]
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

  function openPortInterfaceFromGraph(interfaceRef: string) {
    const interfaceEntity = modelEntities.find((entity) => {
      return entity.id === interfaceRef || entity.semanticPath === interfaceRef;
    });
    if (!interfaceEntity) {
      return;
    }

    const interfaceTab = makeModelTab(
      interfaceEntity,
      "entityDetails",
      "Port Interface"
    );

    preserveActivePreviewTab();
    tabs.openTab(interfaceTab, true);
    setModelFocusEntityId(interfaceEntity.id);
    modelHost.revealModelEntity(interfaceEntity.id);
  }

  function openSwcViewFromGraph(
    entityId: string | undefined,
    semanticPath: string | undefined,
    view: SwcNodeView
  ) {
    const targetEntity = findModelEntity(modelEntities, entityId, semanticPath);
    if (!targetEntity) {
      return;
    }

    // Context-menu navigation should not replace the graph the user invoked it
    // from. Pin a preview graph before opening the requested view in a new tab.
    preserveActivePreviewTab();

    if (view === "graph") {
      const preferredScope = defaultScope(targetEntity);
      tabs.openTab(makeModelTab(targetEntity, "graph", "Graph", { preferredScope }), true);
      setModelPreferredScope(preferredScope);
      setModelPreferredNodeId(undefined);
    } else {
      tabs.openTab(makeModelTab(targetEntity, view, getSwcViewTitle(view)), true);
    }

    setModelFocusEntityId(targetEntity.id);
    modelHost.revealModelEntity(targetEntity.id, getSwcTreeNodeId(targetEntity, view));
  }

  function openPortDetailsFromGraph(
    entityId: string | undefined,
    semanticPath: string | undefined,
    port: SwcGraphPort
  ) {
    const targetEntity = findModelEntity(modelEntities, entityId, semanticPath);
    if (!targetEntity) {
      return;
    }

    preserveActivePreviewTab();
    tabs.openTab(
      makeModelTab(targetEntity, "port", `Port: ${port.label}`, {
        entityId: port.id,
        xmlPath: port.xmlPath
      }),
      true
    );
    setModelFocusEntityId(targetEntity.id);
    modelHost.revealModelEntity(port.id, `${targetEntity.id}:port:${port.id}`);
  }

  function openSwcInstanceFromPanel(instance: SwcInstanceReference) {
    const parentComposition = modelEntities.find((entity) => entity.id === instance.parentCompositionId);
    if (!parentComposition) {
      return;
    }

    const instanceTab = makeModelTab(parentComposition, "graph", `Graph: ${instance.instanceName}`, {
      preferredScope: "composition",
      preferredNodeId: instance.id
    });
    tabs.openTab(instanceTab);
    setModelFocusEntityId(parentComposition.id);
    setModelPreferredScope("composition");
    setModelPreferredNodeId(instance.id);
    modelHost.revealModelEntity(parentComposition.id, instance.treeNodeId);
  }

  function preserveActivePreviewTab() {
    if (!tabs.activeTab) {
      return;
    }
    if (tabs.activeTab.pinned) {
      return;
    }

    tabs.openTab(tabs.activeTab, true);
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
        <EditorGraphZone
          focusEntity={activeModelFocusEntity}
          workspaceRevision={workspace.lastIndexedAt}
          preferredScope={effectiveModelPreferredScope}
          preferredNodeId={activePreferredNodeId}
          activeWorkspaceTab={tabs.activeTab}
          instances={visibleSwcInstances}
          logEntries={logEntries}
          activeBottomPanelTab={activeBottomPanelTab}
          onFocusModelEntity={focusModelEntityFromGraph}
          onCopyText={modelHost.copyText}
          onOpenSwcView={openSwcViewFromGraph}
          onOpenPortInterface={openPortInterfaceFromGraph}
          onOpenPortDetails={openPortDetailsFromGraph}
          onOpenWorkspaceTab={tabs.openTab}
          onBottomPanelTabChange={setActiveBottomPanelTab}
          onInstanceSelect={openSwcInstanceFromPanel}
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

function getVisibleSwcInstances(
  workspace: WorkspaceSnapshot,
  focusEntity: AutosarEntity | undefined,
  preferredNodeId: string | undefined
) {
  const allInstances = workspace.swcInstances ?? [];
  if (!focusEntity) {
    return [];
  }

  if (preferredNodeId) {
    const activeInstance = allInstances.find((instance) => {
      return instance.id === preferredNodeId && instance.parentCompositionId === focusEntity.id;
    });
    if (activeInstance) {
      return allInstances.filter((instance) => instance.swcId === activeInstance.swcId);
    }
  }

  return allInstances.filter((instance) => instance.swcId === focusEntity.id);
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

function findModelEntity(
  entities: AutosarEntity[],
  entityId: string | undefined,
  semanticPath: string | undefined
) {
  return entities.find((entity) => {
    return (
      entity.id === entityId ||
      entity.semanticPath === semanticPath ||
      entity.shortName === semanticPath
    );
  });
}

function getSwcViewTitle(view: Exclude<SwcNodeView, "graph">) {
  switch (view) {
    case "runnables":
      return "Runnables";
    case "ports":
      return "Ports";
    case "interRunnableVariables":
      return "Inter-Runnable Variables";
    case "parameters":
      return "Calibration Parameters";
  }
}

function getSwcTreeNodeId(entity: AutosarEntity, view: SwcNodeView) {
  if (entity.type !== "swc") {
    return undefined;
  }

  return `${entity.id}:${view}`;
}
