import type { ModelWorkspaceTab } from "./EditorTabs";
import "./EditorTabs.css";

interface EditorTabsProps {
  tabs: ModelWorkspaceTab[];
  activeTabId?: string;
  onActivate: (tabId: string) => void;
  onPin: (tab: ModelWorkspaceTab) => void;
  onClose: (tabId: string) => void;
}

export function EditorTabs(props: EditorTabsProps) {
  return (
    <div className="editor-tabs">
      {props.tabs.map((tab) => {
        let tabClassName = "editor-tab";
        if (tab.id === props.activeTabId) {
          tabClassName += " active";
        }
        if (!tab.pinned) {
          tabClassName += " preview";
        }

        return (
          <div key={tab.id} className={tabClassName}>
            <button
              type="button"
              className="editor-tab-button"
              onClick={() => props.onActivate(tab.id)}
              onDoubleClick={() => props.onPin(tab)}
              title={tab.pinned ? tab.title : `${tab.title} (preview)`}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className="editor-tab-close"
              onClick={() => props.onClose(tab.id)}
              aria-label={`Close ${tab.title}`}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}
