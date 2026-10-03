import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BreadcrumbTrail } from "./BreadcrumbTrail";

export interface DetailsTab {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

export interface DetailBreadcrumb {
  label: string;
  onClick?: () => void;
}

export function DetailsBottomTabs(props: {
  title: string;
  tabs: DetailsTab[];
  contextKey: string;
  initialTabId?: string;
  breadcrumbs?: DetailBreadcrumb[];
  topContent?: ReactNode;
  renderTabContent?: (content: ReactNode, tabId: string) => ReactNode;
}) {
  const [tabSelection, setTabSelection] = useState({
    contextKey: props.contextKey,
    tabId: props.initialTabId ?? props.tabs[0]?.id
  });
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  // Derive the first tab for a new entity during render. Resetting it in an
  // effect would paint the previous entity's tab for one frame.
  const activeTabId = tabSelection.contextKey === props.contextKey
    ? tabSelection.tabId
    : props.initialTabId ?? props.tabs[0]?.id;
  const activeTab = props.tabs.find((tab) => tab.id === activeTabId) ?? props.tabs[0];

  function selectTab(tabId: string) {
    setTabSelection({ contextKey: props.contextKey, tabId });
  }

  // Relationship views keep their hierarchy in the tab panel. Reveal it again
  // when switching away from a long table or member list.
  useEffect(() => {
    if ((props.renderTabContent || props.topContent) && tabPanelRef.current) {
      tabPanelRef.current.scrollTop = 0;
    }
  }, [activeTabId, props.contextKey]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % props.tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + props.tabs.length) % props.tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = props.tabs.length - 1;
    } else {
      return;
    }

    const nextTab = props.tabs[nextIndex];
    if (!nextTab) {
      return;
    }
    event.preventDefault();
    selectTab(nextTab.id);
    tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextIndex]?.focus();
  }

  return (
    <div className="model-semantic-surface model-details-with-bottom-tabs">
      <div className="model-semantic-header">
        <BreadcrumbTrail title={props.title} breadcrumbs={props.breadcrumbs} />
      </div>
      {activeTab && (
        <div
          ref={tabPanelRef}
          id={`${idPrefix}-panel-${activeTab.id}`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${activeTab.id}`}
          className="model-port-detail model-details-tab-content"
        >
          {props.topContent}
          {props.renderTabContent
            ? props.renderTabContent(activeTab.content, activeTab.id)
            : activeTab.content}
        </div>
      )}
      <div ref={tabListRef} className="model-details-bottom-tabs" role="tablist" aria-label={`${props.title} sections`}>
        {props.tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab?.id}
            aria-controls={tab.id === activeTab?.id ? `${idPrefix}-panel-${tab.id}` : undefined}
            tabIndex={tab.id === activeTab?.id ? 0 : -1}
            className={tab.id === activeTab?.id ? "is-active" : undefined}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="model-details-tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
