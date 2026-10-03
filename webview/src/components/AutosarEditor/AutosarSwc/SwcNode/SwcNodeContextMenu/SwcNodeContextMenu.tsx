import type { SwcNodeView } from "../../AutosarSwcLayout";
import {
  SwcContextMenu,
  ContextMenuCommand,
  ContextMenuSeparator
} from "./SwcContextMenu";

interface SwcNodeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyName?: () => void;
  onOpenView?: (view: SwcNodeView) => void;
  isComposition?: boolean;
}

/** Renders node actions in screen space so graph zoom does not resize the menu. */
export function SwcNodeContextMenu(props: SwcNodeContextMenuProps) {
  return (
    <SwcContextMenu x={props.x} y={props.y} estimatedHeight={230} onClose={props.onClose}>
      <ContextMenuCommand
        label={props.isComposition ? "Copy Composition name" : "Copy SWC name"}
        onSelect={() => {
          props.onCopyName?.();
          props.onClose();
        }}
      />
      <ContextMenuSeparator />
      <ContextMenuCommand label={props.isComposition ? "Show Composition Graph" : "Show SWC Graph"} onSelect={() => selectView(props, "graph")} />
      <ContextMenuCommand label="Show SWC Runnable details" disabled={props.isComposition} onSelect={() => selectView(props, "runnables")} />
      <ContextMenuCommand label="Show Port details" onSelect={() => selectView(props, "ports")} />
      <ContextMenuCommand
        label="Show Inter-Runnable Variables"
        disabled={props.isComposition}
        onSelect={() => selectView(props, "interRunnableVariables")}
      />
      <ContextMenuCommand label="Show Calibration Parameters" disabled={props.isComposition} onSelect={() => selectView(props, "parameters")} />
    </SwcContextMenu>
  );
}

function selectView(props: SwcNodeContextMenuProps, view: SwcNodeView) {
  props.onOpenView?.(view);
  props.onClose();
}
