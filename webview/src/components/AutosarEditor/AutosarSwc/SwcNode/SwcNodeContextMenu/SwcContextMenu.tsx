import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface SwcContextMenuProps {
  x: number;
  y: number;
  estimatedHeight: number;
  onClose: () => void;
  children: ReactNode;
}

const MENU_WIDTH = 250;
const VIEWPORT_MARGIN = 8;

/** Keeps graph context menus at a readable screen-space size and inside the viewport. */
export function SwcContextMenu(props: SwcContextMenuProps) {
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
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - props.estimatedHeight - VIEWPORT_MARGIN
  );
  const left = Math.min(Math.max(props.x, VIEWPORT_MARGIN), maxLeft);
  const top = Math.min(Math.max(props.y, VIEWPORT_MARGIN), maxTop);

  return createPortal(
    <div
      className="autosar-context-menu"
      role="menu"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.children}
    </div>,
    document.body
  );
}

export function ContextMenuCommand(props: {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="autosar-context-menu-command"
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      {props.label}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="autosar-context-menu-separator" role="separator" />;
}
