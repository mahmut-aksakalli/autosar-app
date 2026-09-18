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
}

/** Renders node actions in screen space so graph zoom does not resize the menu. */
export function SwcNodeContextMenu(props: SwcNodeContextMenuProps) {
  return (
    <SwcContextMenu x={props.x} y={props.y} estimatedHeight={230} onClose={props.onClose}>
      <ContextMenuCommand
        label="Copy SWC name"
        onSelect={() => {
          props.onCopyName?.();
          props.onClose();
        }}
      />
      <ContextMenuSeparator />
      <ContextMenuCommand label="Show SWC Graph" onSelect={() => selectView(props, "graph")} />
      <ContextMenuCommand label="Show SWC Runnable details" onSelect={() => selectView(props, "runnables")} />
      <ContextMenuCommand label="Show SWC Port details" onSelect={() => selectView(props, "ports")} />
      <ContextMenuCommand
        label="Show Inter-Runnable Variables"
        onSelect={() => selectView(props, "interRunnableVariables")}
      />
      <ContextMenuCommand label="Show Calibration Parameters" onSelect={() => selectView(props, "parameters")} />
    </SwcContextMenu>
  );
}

function selectView(props: SwcNodeContextMenuProps, view: SwcNodeView) {
  props.onOpenView?.(view);
  props.onClose();
}
