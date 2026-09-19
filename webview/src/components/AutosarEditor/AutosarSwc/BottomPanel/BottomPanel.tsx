import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { AutosarLogEntry, SwcInstanceReference } from "../../../../../../src/shared/contracts";
import { InstancesTable } from "./Instances/InstancesTable";
import { OutputLog } from "./Output/OutputLog";
import "./BottomPanel.css";

export type BottomPanelTab = "instances" | "output";

export const DEFAULT_BOTTOM_PANEL_HEIGHT = 230;
const MINIMUM_PANEL_HEIGHT = 150;
const KEYBOARD_RESIZE_STEP = 20;

interface ResizeStart {
  pointerY: number;
  panelHeight: number;
}

export function BottomPanel(props: {
  activeTab: BottomPanelTab;
  instances: SwcInstanceReference[];
  activeInstanceId?: string;
  logEntries: AutosarLogEntry[];
  panelHeight: number;
  isMinimized: boolean;
  onActiveTabChange: (tab: BottomPanelTab) => void;
  onHeightChange: (height: number) => void;
  onMinimizedChange: (isMinimized: boolean) => void;
  onInstanceSelect: (instance: SwcInstanceReference) => void;
}) {
  const resizeStartRef = useRef<ResizeStart | undefined>(undefined);

  function constrainPanelHeight(height: number) {
    // Leave enough canvas visible to keep the graph useful while the panel is enlarged.
    const maximumPanelHeight = Math.max(MINIMUM_PANEL_HEIGHT, window.innerHeight - 120);
    return Math.min(Math.max(height, MINIMUM_PANEL_HEIGHT), maximumPanelHeight);
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = {
      pointerY: event.clientY,
      panelHeight: props.panelHeight
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizePanel(event: PointerEvent<HTMLDivElement>) {
    const resizeStart = resizeStartRef.current;
    if (!resizeStart) {
      return;
    }

    // The panel is attached to the bottom, so moving upward increases its height.
    const pointerDistance = resizeStart.pointerY - event.clientY;
    props.onHeightChange(constrainPanelHeight(resizeStart.panelHeight + pointerDistance));
  }

  function stopResize(event: PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      props.onHeightChange(constrainPanelHeight(props.panelHeight + KEYBOARD_RESIZE_STEP));
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      props.onHeightChange(constrainPanelHeight(props.panelHeight - KEYBOARD_RESIZE_STEP));
    }
  }

  function restoreDefaultSize() {
    props.onHeightChange(constrainPanelHeight(DEFAULT_BOTTOM_PANEL_HEIGHT));
    props.onMinimizedChange(false);
  }

  let panelContent;
  if (props.activeTab === "instances") {
    panelContent = (
      <InstancesTable
        instances={props.instances}
        activeInstanceId={props.activeInstanceId}
        onInstanceSelect={props.onInstanceSelect}
      />
    );
  } else {
    panelContent = <OutputLog entries={props.logEntries} isVisible={props.activeTab === "output"} />;
  }

  const panelClassName = props.isMinimized
    ? "graph-bottom-panel is-minimized"
    : "graph-bottom-panel";
  const panelStyle = {
    "--graph-bottom-panel-height": `${props.panelHeight}px`
  } as CSSProperties;

  return (
    <section className={panelClassName} style={panelStyle} aria-label="Graph information panel">
      {!props.isMinimized && (
        <div
          className="graph-bottom-panel-resize-handle"
          role="separator"
          aria-label="Resize graph panel"
          aria-orientation="horizontal"
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={resizePanel}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onKeyDown={resizeWithKeyboard}
        />
      )}
      <div className="graph-bottom-panel-header">
        <div className="graph-bottom-panel-tabs" role="tablist" aria-label="Graph panel tabs">
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === "instances"}
            className={props.activeTab === "instances" ? "is-active" : undefined}
            onClick={() => props.onActiveTabChange("instances")}
          >
            Instances ({props.instances.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === "output"}
            className={props.activeTab === "output" ? "is-active" : undefined}
            onClick={() => props.onActiveTabChange("output")}
          >
            Output
          </button>
        </div>
        <div className="graph-bottom-panel-actions">
          <button type="button" title="Restore default panel size" onClick={restoreDefaultSize}>
            Default size
          </button>
          <button
            type="button"
            title={props.isMinimized ? "Restore panel" : "Minimize panel"}
            aria-label={props.isMinimized ? "Restore graph panel" : "Minimize graph panel"}
            aria-expanded={!props.isMinimized}
            onClick={() => props.onMinimizedChange(!props.isMinimized)}
          >
            {props.isMinimized ? "Restore" : "Minimize"}
          </button>
        </div>
      </div>
      {!props.isMinimized && <div className="graph-bottom-panel-content">{panelContent}</div>}
    </section>
  );
}
