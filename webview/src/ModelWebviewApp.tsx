import { useEffect, useMemo, useState } from "react";
import type { AutosarEntity, SwcGraphScope, WorkspaceSnapshot } from "./shared/contracts";
import { ModelPanel, type ModelWorkspaceTab } from "./model/ModelPanel";

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
  const modelEntities = useMemo(
    () =>
      workspace.entities
        .filter((entity) => entity.type === "swc" || entity.type === "composition")
        .slice()
        .sort((left, right) => left.shortName.localeCompare(right.shortName)),
    [workspace.entities]
  );
  const [modelFocusEntityId, setModelFocusEntityId] = useState(
    initialState.focusEntityId ?? initialState.activeWorkspaceTab?.focusEntityId ?? modelEntities[0]?.id
  );
  const [modelPreferredScope, setModelPreferredScope] = useState<SwcGraphScope>(
    initialState.activeWorkspaceTab?.preferredScope ?? "swc"
  );
  const [modelPreferredNodeId, setModelPreferredNodeId] = useState<string | undefined>(
    initialState.activeWorkspaceTab?.preferredNodeId
  );
  const [modelWorkspaceTabs, setModelWorkspaceTabs] = useState<ModelWorkspaceTab[]>(() => {
    if (initialState.activeWorkspaceTab) {
      return [initialState.activeWorkspaceTab];
    }
    const entity = modelEntities[0];
    return entity ? [makeDefaultModelGraphTab(entity, entity.type === "composition" ? "composition" : "swc")] : [];
  });
  const [activeModelWorkspaceTabId, setActiveModelWorkspaceTabId] = useState(
    initialState.activeWorkspaceTab?.id ?? modelWorkspaceTabs[0]?.id
  );

  const activeModelWorkspaceTab =
    modelWorkspaceTabs.find((tab) => tab.id === activeModelWorkspaceTabId) ?? modelWorkspaceTabs[0];
  const activeModelFocusEntity =
    modelEntities.find((entity) => entity.id === activeModelWorkspaceTab?.focusEntityId) ??
    modelEntities.find((entity) => entity.id === modelFocusEntityId) ??
    modelEntities[0];
  const effectiveModelPreferredScope =
    activeModelWorkspaceTab?.preferredScope ??
    modelPreferredScope ??
    (activeModelFocusEntity?.type === "composition" ? "composition" : "swc");

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as
        | {
            type: "focusModel";
            focusEntityId?: string;
            activeWorkspaceTab?: ModelWorkspaceTab;
          }
        | {
            type: "workspaceUpdated";
            workspace?: WorkspaceSnapshot;
          }
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
      const tab =
        message.activeWorkspaceTab ??
        (targetEntity
          ? makeDefaultModelGraphTab(targetEntity, targetEntity.type === "composition" ? "composition" : "swc")
          : undefined);

      if (!targetEntity || !tab) {
        return;
      }

      setModelFocusEntityId(targetEntity.id);
      setModelPreferredScope(tab.preferredScope ?? (targetEntity.type === "composition" ? "composition" : "swc"));
      setModelPreferredNodeId(tab.preferredNodeId);
      openModelWorkspaceTab(tab);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [modelEntities]);

  function openModelWorkspaceTab(tab: ModelWorkspaceTab | undefined, pinned = false) {
    if (!tab) {
      return;
    }

    const nextTab = {
      ...tab,
      pinned: pinned || tab.pinned
    };

    setModelWorkspaceTabs((current) => {
      const existingTab = current.find((entry) => entry.id === nextTab.id);
      if (existingTab) {
        return existingTab.pinned || !nextTab.pinned
          ? current
          : current.map((entry) => (entry.id === nextTab.id ? { ...entry, pinned: true } : entry));
      }
      return [...current.filter((entry) => entry.pinned), nextTab];
    });
    setActiveModelWorkspaceTabId(nextTab.id);
  }

  function focusModelEntityFromGraph(selection: {
    entityId?: string;
    semanticPath?: string;
    preferredScope?: SwcGraphScope;
    preferredNodeId?: string;
    includeCompositionInternals?: boolean;
  }) {
    const targetEntity = modelEntities.find(
      (entity) =>
        entity.id === selection.entityId ||
        entity.semanticPath === selection.semanticPath ||
        entity.shortName === selection.semanticPath
    );
    if (!targetEntity) {
      return;
    }

    const preferredScope = selection.preferredScope ?? (targetEntity.type === "composition" ? "composition" : "swc");
    const tab = makeModelTab(targetEntity, "graph", "Graph", {
      preferredScope,
      preferredNodeId: selection.preferredNodeId,
      includeCompositionInternals: selection.includeCompositionInternals
    });

    setModelFocusEntityId(targetEntity.id);
    setModelPreferredScope(preferredScope);
    setModelPreferredNodeId(selection.preferredNodeId);
    openModelWorkspaceTab(tab);
  }

  if (!activeModelFocusEntity || !activeModelWorkspaceTab) {
    return <div className="empty-state">No AUTOSAR SWC or composition was discovered.</div>;
  }

  return (
    <div className="webview-model-shell">
      <div className="editor-tabs">
        {modelWorkspaceTabs.map((tab) => (
          <div key={tab.id} className={`editor-tab ${tab.id === activeModelWorkspaceTab.id ? "active" : ""}`}>
            <button
              type="button"
              className="editor-tab-button"
              onClick={() => setActiveModelWorkspaceTabId(tab.id)}
              onDoubleClick={() => openModelWorkspaceTab(tab, true)}
              title={tab.pinned ? tab.title : `${tab.title} (preview)`}
            >
              {tab.title}
            </button>
            {modelWorkspaceTabs.length > 1 && (
              <button
                type="button"
                className="editor-tab-close"
                onClick={() => {
                  setModelWorkspaceTabs((current) => current.filter((entry) => entry.id !== tab.id));
                  if (activeModelWorkspaceTabId === tab.id) {
                    setActiveModelWorkspaceTabId(modelWorkspaceTabs.find((entry) => entry.id !== tab.id)?.id);
                  }
                }}
                aria-label={`Close ${tab.title}`}
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="editor-view">
        <ModelPanel
          focusEntity={activeModelFocusEntity}
          preferredScope={effectiveModelPreferredScope}
          preferredNodeId={activeModelWorkspaceTab.preferredNodeId ?? modelPreferredNodeId}
          activeWorkspaceTab={activeModelWorkspaceTab}
          onFocusModelEntity={focusModelEntityFromGraph}
          onOpenWorkspaceTab={(tab) => openModelWorkspaceTab(tab)}
        />
      </div>
    </div>
  );
}

function makeModelTab(
  entity: AutosarEntity,
  kind: ModelWorkspaceTab["kind"],
  titlePrefix: string,
  options: Partial<ModelWorkspaceTab> = {}
): ModelWorkspaceTab {
  return {
    id: `${entity.id}:${kind}:${options.entityId ?? options.itemId ?? options.preferredNodeId ?? "main"}${
      options.includeCompositionInternals ? ":internals" : ""
    }`,
    title: titlePrefix.includes(":") ? titlePrefix : `${titlePrefix}: ${entity.shortName}`,
    pinned: options.pinned,
    kind,
    focusEntityId: entity.id,
    preferredScope: options.preferredScope,
    preferredNodeId: options.preferredNodeId,
    includeCompositionInternals: options.includeCompositionInternals,
    entityId: options.entityId,
    sectionId: options.sectionId,
    itemId: options.itemId,
    xmlPath: options.xmlPath
  };
}

function makeDefaultModelGraphTab(entity: AutosarEntity, preferredScope: SwcGraphScope): ModelWorkspaceTab {
  return makeModelTab(entity, "graph", "Graph", {
    preferredScope
  });
}
