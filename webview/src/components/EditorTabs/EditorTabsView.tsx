import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ModelWorkspaceTab } from "./EditorTabs";
import "./EditorTabs.css";

interface EditorTabsProps {
  tabs: ModelWorkspaceTab[];
  activeTabId?: string;
  onActivate: (tabId: string) => void;
  onPin: (tab: ModelWorkspaceTab) => void;
  onClose: (tabId: string) => void;
  onReorder: (tabId: string, targetTabId: string, position: "before" | "after") => void;
}

export function EditorTabs(props: EditorTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const draggedTabIdRef = useRef<string | null>(null);
  const scrollSpeedRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !props.activeTabId) {
      return;
    }

    const activeTab = Array.from(strip.children).find(
      (child) => child instanceof HTMLElement && child.dataset.tabId === props.activeTabId
    );
    if (!(activeTab instanceof HTMLElement)) {
      return;
    }

    const stripBounds = strip.getBoundingClientRect();
    const tabBounds = activeTab.getBoundingClientRect();
    if (tabBounds.left < stripBounds.left) {
      strip.scrollLeft -= stripBounds.left - tabBounds.left;
    } else if (tabBounds.right > stripBounds.right) {
      strip.scrollLeft += tabBounds.right - stripBounds.right;
    }
  }, [props.activeTabId]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      const currentStrip = stripRef.current;
      if (!currentStrip || event.ctrlKey || currentStrip.scrollWidth <= currentStrip.clientWidth) {
        return;
      }

      // A regular vertical wheel should move the horizontal tab strip. Keep
      // trackpad horizontal movement when it is the stronger gesture.
      let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        delta *= 16;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        delta *= currentStrip.clientWidth;
      }

      const maximumScroll = currentStrip.scrollWidth - currentStrip.clientWidth;
      const nextScroll = Math.max(0, Math.min(maximumScroll, currentStrip.scrollLeft + delta));
      if (nextScroll === currentStrip.scrollLeft) {
        return;
      }

      event.preventDefault();
      currentStrip.scrollLeft = nextScroll;
    }

    // React's wheel listener may be passive. This listener can prevent the
    // editor beneath the tabs from scrolling during tab navigation.
    strip.addEventListener("wheel", handleWheel, { passive: false });
    return () => strip.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  function stopEdgeScroll() {
    scrollSpeedRef.current = 0;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function scrollTowardEdge() {
    const strip = stripRef.current;
    if (!strip || scrollSpeedRef.current === 0) {
      scrollFrameRef.current = null;
      return;
    }

    strip.scrollLeft += scrollSpeedRef.current;
    scrollFrameRef.current = requestAnimationFrame(scrollTowardEdge);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    const strip = stripRef.current;
    if (!strip || !draggedTabIdRef.current) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = strip.getBoundingClientRect();
    const edgeWidth = 48;

    if (strip.scrollWidth <= strip.clientWidth) {
      stopEdgeScroll();
    } else if (event.clientX < bounds.left + edgeWidth) {
      scrollSpeedRef.current = -12;
    } else if (event.clientX > bounds.right - edgeWidth) {
      scrollSpeedRef.current = 12;
    } else {
      stopEdgeScroll();
    }

    if (scrollSpeedRef.current !== 0 && scrollFrameRef.current === null) {
      scrollFrameRef.current = requestAnimationFrame(scrollTowardEdge);
    }
  }

  function finishDrag() {
    stopEdgeScroll();
    draggedTabIdRef.current = null;
    setDraggedTabId(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const draggedTabId = draggedTabIdRef.current;
    const strip = stripRef.current;
    if (!draggedTabId || !strip) {
      finishDrag();
      return;
    }

    const tabElements = Array.from(strip.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && Boolean(child.dataset.tabId)
    );
    for (const tabElement of tabElements) {
      const midpoint = tabElement.getBoundingClientRect().left + tabElement.clientWidth / 2;
      if (event.clientX < midpoint) {
        props.onReorder(draggedTabId, tabElement.dataset.tabId!, "before");
        finishDrag();
        return;
      }
    }

    const lastTabId = tabElements.at(-1)?.dataset.tabId;
    if (lastTabId) {
      props.onReorder(draggedTabId, lastTabId, "after");
    }
    finishDrag();
  }

  return (
    <div
      ref={stripRef}
      className="editor-tabs"
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) {
          stopEdgeScroll();
        }
      }}
      onDrop={handleDrop}
    >
      {props.tabs.map((tab) => {
        let tabClassName = "editor-tab";
        if (tab.id === props.activeTabId) {
          tabClassName += " active";
        }
        if (!tab.pinned) {
          tabClassName += " preview";
        }
        if (tab.id === draggedTabId) {
          tabClassName += " dragging";
        }

        return (
          <div
            key={tab.id}
            className={tabClassName}
            data-tab-id={tab.id}
            draggable
            onDragStart={(event) => {
              draggedTabIdRef.current = tab.id;
              setDraggedTabId(tab.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", tab.id);
            }}
            onDragEnd={finishDrag}
          >
            <button
              type="button"
              className="editor-tab-button"
              onClick={() => props.onActivate(tab.id)}
              onDoubleClick={() => props.onPin(tab)}
              title={tab.title}
            >
              <span className="editor-tab-title">{tab.title}</span>
              {!tab.pinned && <span className="editor-tab-preview-label">(Preview)</span>}
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
