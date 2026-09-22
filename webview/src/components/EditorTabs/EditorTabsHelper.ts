import { useCallback, useMemo, useReducer } from "react";
import type { ModelWorkspaceTab } from "./EditorTabs";

interface WorkspaceTabsState {
  tabs: ModelWorkspaceTab[];
  activeTabId?: string;
}

type WorkspaceTabsAction =
  | { type: "activate"; tabId: string }
  | { type: "open"; tab: ModelWorkspaceTab; pinned: boolean }
  | { type: "close"; tabId: string }
  | { type: "reorder"; tabId: string; targetTabId: string; position: "before" | "after" };

export function workspaceTabsReducer(
  state: WorkspaceTabsState,
  action: WorkspaceTabsAction
): WorkspaceTabsState {
  if (action.type === "activate") {
    return { ...state, activeTabId: action.tabId };
  }

  if (action.type === "close") {
    const tabs = state.tabs.filter((tab) => tab.id !== action.tabId);
    if (state.activeTabId !== action.tabId) {
      return { ...state, tabs };
    }

    // Closing the active tab follows the same deterministic rule as VS Code's
    // preview area: activate the first tab that remains.
    return { tabs, activeTabId: tabs[0]?.id };
  }

  if (action.type === "reorder") {
    if (action.tabId === action.targetTabId) {
      return state;
    }

    const sourceIndex = state.tabs.findIndex((tab) => tab.id === action.tabId);
    const targetIndex = state.tabs.findIndex((tab) => tab.id === action.targetTabId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return state;
    }

    const tabs = state.tabs.slice();
    const [movedTab] = tabs.splice(sourceIndex, 1);
    if (!movedTab) {
      return state;
    }

    const newTargetIndex = tabs.findIndex((tab) => tab.id === action.targetTabId);
    const insertIndex = action.position === "after" ? newTargetIndex + 1 : newTargetIndex;
    tabs.splice(insertIndex, 0, movedTab);
    return { ...state, tabs };
  }

  let isPinned = action.tab.pinned === true;
  if (action.pinned) {
    isPinned = true;
  }
  const tab = { ...action.tab, pinned: isPinned };
  const existing = state.tabs.find((entry) => entry.id === tab.id);
  if (existing) {
    let tabs = state.tabs;
    const shouldPinExistingTab = tab.pinned && !existing.pinned;
    if (shouldPinExistingTab) {
      tabs = state.tabs.map((entry) => {
        if (entry.id === tab.id) {
          return { ...entry, pinned: true };
        }
        return entry;
      });
    }
    return { tabs, activeTabId: tab.id };
  }

  // Only one unpinned preview tab is kept. Opening another preview replaces
  // it, while explicitly pinned tabs are preserved.
  const pinnedTabs = state.tabs.filter((entry) => entry.pinned);
  return {
    tabs: [...pinnedTabs, tab],
    activeTabId: tab.id
  };
}

export function useWorkspaceTabs(initialTabs: ModelWorkspaceTab[], initialActiveTabId?: string) {
  let activeTabId = initialActiveTabId;
  if (!activeTabId) {
    activeTabId = initialTabs[0]?.id;
  }
  const [state, dispatch] = useReducer(workspaceTabsReducer, {
    tabs: initialTabs,
    activeTabId
  });
  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0],
    [state.activeTabId, state.tabs]
  );
  const activateTab = useCallback((tabId: string) => dispatch({ type: "activate", tabId }), []);
  const openTab = useCallback(
    (tab: ModelWorkspaceTab, pinned = false) => dispatch({ type: "open", tab, pinned }),
    []
  );
  const closeTab = useCallback((tabId: string) => dispatch({ type: "close", tabId }), []);
  const reorderTab = useCallback(
    (tabId: string, targetTabId: string, position: "before" | "after") =>
      dispatch({ type: "reorder", tabId, targetTabId, position }),
    []
  );

  return {
    tabs: state.tabs,
    activeTab,
    activateTab,
    openTab,
    closeTab,
    reorderTab
  };
}
