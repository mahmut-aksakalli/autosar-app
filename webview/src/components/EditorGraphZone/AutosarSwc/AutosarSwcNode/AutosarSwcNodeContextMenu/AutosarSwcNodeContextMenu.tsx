import type { SwcNodeView } from "../../AutosarSwcLayout";
import {
  AutosarSwcContextMenu,
  ContextMenuCommand,
  ContextMenuSeparator
} from "./AutosarSwcContextMenu";

interface AutosarSwcNodeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyName?: () => void;
  onOpenView?: (view: SwcNodeView) => void;
}

/** Renders node actions in screen space so graph zoom does not resize the menu. */
export function AutosarSwcNodeContextMenu(props: AutosarSwcNodeContextMenuProps) {
  return (
    <AutosarSwcContextMenu x={props.x} y={props.y} estimatedHeight={230} onClose={props.onClose}>
      <ContextMenuCommand
        label="Copy SWC name"
        onSelect={() => {
          props.onCopyName?.();
          props.onClose();
        }}
      />
      <ContextMenuSeparator />
      <ContextMenuCommand label="Go to target SWC Graph" onSelect={() => selectView(props, "graph")} />
      <ContextMenuCommand label="Show SWC Runnable details" onSelect={() => selectView(props, "runnables")} />
      <ContextMenuCommand label="Show SWC Port details" onSelect={() => selectView(props, "ports")} />
      <ContextMenuCommand
        label="Show Inter-Runnable Variables"
        onSelect={() => selectView(props, "interRunnableVariables")}
      />
      <ContextMenuCommand label="Show Calibration Parameters" onSelect={() => selectView(props, "parameters")} />
    </AutosarSwcContextMenu>
  );
}

function selectView(props: AutosarSwcNodeContextMenuProps, view: SwcNodeView) {
  props.onOpenView?.(view);
  props.onClose();
}
