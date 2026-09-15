import { useCallback, useMemo, useReducer } from "react";
import type { ModelWorkspaceTab } from "./modelWorkspaceTab";

interface WorkspaceTabsState {
  tabs: ModelWorkspaceTab[];
  activeTabId?: string;
}

type WorkspaceTabsAction =
  | { type: "activate"; tabId: string }
  | { type: "open"; tab: ModelWorkspaceTab; pinned: boolean }
  | { type: "close"; tabId: string };

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
    return { tabs, activeTabId: tabs[0]?.id };
  }

  const tab = { ...action.tab, pinned: action.pinned || action.tab.pinned };
  const existing = state.tabs.find((entry) => entry.id === tab.id);
  if (existing) {
    const tabs = existing.pinned || !tab.pinned
      ? state.tabs
      : state.tabs.map((entry) => (entry.id === tab.id ? { ...entry, pinned: true } : entry));
    return { tabs, activeTabId: tab.id };
  }

  return {
    tabs: [...state.tabs.filter((entry) => entry.pinned), tab],
    activeTabId: tab.id
  };
}

export function useWorkspaceTabs(initialTabs: ModelWorkspaceTab[], initialActiveTabId?: string) {
  const [state, dispatch] = useReducer(workspaceTabsReducer, {
    tabs: initialTabs,
    activeTabId: initialActiveTabId ?? initialTabs[0]?.id
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

  return {
    tabs: state.tabs,
    activeTab,
    activateTab,
    openTab,
    closeTab
  };
}
