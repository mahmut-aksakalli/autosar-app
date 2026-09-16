import type { ModelWorkspaceTab } from "./workspaceTab";

interface EditorTabsProps {
  tabs: ModelWorkspaceTab[];
  activeTabId?: string;
  onActivate: (tabId: string) => void;
  onPin: (tab: ModelWorkspaceTab) => void;
  onClose: (tabId: string) => void;
}

export function EditorTabs({ tabs, activeTabId, onActivate, onPin, onClose }: EditorTabsProps) {
  return (
    <div className="editor-tabs">
      {tabs.map((tab) => (
        <div key={tab.id} className={`editor-tab ${tab.id === activeTabId ? "active" : ""}`}>
          <button
            type="button"
            className="editor-tab-button"
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onPin(tab)}
            title={tab.pinned ? tab.title : `${tab.title} (preview)`}
          >
            {tab.title}
          </button>
          {tabs.length > 1 && (
            <button
              type="button"
              className="editor-tab-close"
              onClick={() => onClose(tab.id)}
              aria-label={`Close ${tab.title}`}
            >
              x
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
