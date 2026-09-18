import type { SwcGraphPort } from "../../../../../../../../src/shared/contracts";
import {
  AutosarSwcContextMenu,
  ContextMenuCommand,
  ContextMenuSeparator
} from "../../AutosarSwcNodeContextMenu/AutosarSwcContextMenu";

interface AutosarSwcPortContextMenuProps {
  x: number;
  y: number;
  port: SwcGraphPort;
  interfaceName?: string;
  onClose: () => void;
  onCopyText?: (text: string) => void;
  onOpenDetails?: (port: SwcGraphPort) => void;
  onOpenInterface?: (interfaceRef: string) => void;
}

/** Provides actions for the exact port that received the right-click. */
export function AutosarSwcPortContextMenu(props: AutosarSwcPortContextMenuProps) {
  return (
    <AutosarSwcContextMenu
      x={props.x}
      y={props.y}
      estimatedHeight={160}
      onClose={props.onClose}
    >
      <ContextMenuCommand
        label="Copy Port Prototype Name"
        onSelect={() => {
          props.onCopyText?.(props.port.label);
          props.onClose();
        }}
      />
      <ContextMenuCommand
        label="Copy Port Interface Name"
        disabled={!props.interfaceName}
        onSelect={() => {
          if (props.interfaceName) {
            props.onCopyText?.(props.interfaceName);
          }
          props.onClose();
        }}
      />
      <ContextMenuSeparator />
      <ContextMenuCommand
        label="Go to Port Prototype Details"
        onSelect={() => {
          props.onOpenDetails?.(props.port);
          props.onClose();
        }}
      />
      <ContextMenuCommand
        label="Go to Port Interface Details"
        disabled={!props.port.interfaceRef}
        onSelect={() => {
          if (props.port.interfaceRef) {
            props.onOpenInterface?.(props.port.interfaceRef);
          }
          props.onClose();
        }}
      />
    </AutosarSwcContextMenu>
  );
}
