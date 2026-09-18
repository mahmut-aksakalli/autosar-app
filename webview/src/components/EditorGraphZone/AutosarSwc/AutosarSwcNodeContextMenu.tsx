import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SwcNodeView } from "./AutosarSwcLayout";

interface AutosarSwcNodeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyName?: () => void;
  onOpenView?: (view: SwcNodeView) => void;
}

const MENU_WIDTH = 250;
const MENU_HEIGHT = 230;
const VIEWPORT_MARGIN = 8;

/** Renders node actions in screen space so graph zoom does not resize the menu. */
export function AutosarSwcNodeContextMenu(props: AutosarSwcNodeContextMenuProps) {
  useEffect(() => {
    function closeOnPointerDown() {
      props.onClose();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.onClose();
      }
    }

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("blur", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("blur", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [props.onClose]);

  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - MENU_HEIGHT - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(props.x, VIEWPORT_MARGIN), maxLeft);
  const top = Math.min(Math.max(props.y, VIEWPORT_MARGIN), maxTop);

  return createPortal(
    <div
      className="autosar-node-context-menu"
      role="menu"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuCommand
        label="Copy SWC name"
        onSelect={() => {
          props.onCopyName?.();
          props.onClose();
        }}
      />
      <div className="autosar-node-context-menu-separator" role="separator" />
      <MenuCommand label="Go to target SWC Graph" onSelect={() => selectView(props, "graph")} />
      <MenuCommand label="Show SWC Runnable details" onSelect={() => selectView(props, "runnables")} />
      <MenuCommand label="Show SWC Port details" onSelect={() => selectView(props, "ports")} />
      <MenuCommand
        label="Show Inter-Runnable Variables"
        onSelect={() => selectView(props, "interRunnableVariables")}
      />
      <MenuCommand label="Show Calibration Parameters" onSelect={() => selectView(props, "parameters")} />
    </div>,
    document.body
  );
}

function MenuCommand(props: { label: string; onSelect: () => void }) {
  return (
    <button type="button" className="autosar-node-context-menu-command" role="menuitem" onClick={props.onSelect}>
      {props.label}
    </button>
  );
}

function selectView(props: AutosarSwcNodeContextMenuProps, view: SwcNodeView) {
  props.onOpenView?.(view);
  props.onClose();
}
