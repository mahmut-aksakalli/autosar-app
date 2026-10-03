import { Handle, Position } from "@xyflow/react";
import type React from "react";
import { useCallback, useState } from "react";
import type { SwcGraphPort } from "../../../../../../../src/shared/contracts";
import { PortSymbol } from "../../../../Common/PortSymbol";
import { getPortConnectionCategory, getPortConnectionHandleId, type FlowNodeData } from "../../AutosarSwcLayout";
import { SwcPortContextMenu } from "./SwcPortContextMenu/SwcPortContextMenu";
import { HighlightedText } from "../../SearchBox/HighlightedText";

interface SwcPortsProps {
  ports: FlowNodeData["ports"];
  portConnections?: FlowNodeData["portConnections"];
  side: "left" | "right";
  railWidth?: number;
  highlightedPortId?: string;
  selectedPortId?: string;
  onPortSelect?: FlowNodeData["onPortSelect"];
  onPortInterfaceOpen?: FlowNodeData["onPortInterfaceOpen"];
  onConnectionNavigate?: FlowNodeData["onConnectionNavigate"];
  onCopyText?: FlowNodeData["onCopyText"];
  onPortDetailsOpen?: FlowNodeData["onPortDetailsOpen"];
  searchQuery?: string;
  activeSearchKey?: string;
  searchNodeId: string;
}

interface PortContextMenuState {
  x: number;
  y: number;
  port: SwcGraphPort;
  interfaceName?: string;
}

/** Renders one side of an SWC node, including its React Flow connection handles. */
export function SwcPorts(props: SwcPortsProps) {
  const [contextMenu, setContextMenu] = useState<PortContextMenuState>();
  const closeContextMenu = useCallback(() => setContextMenu(undefined), []);

  if (props.ports.length === 0) {
    return <div className="autosar-node-empty" />;
  }

  let portLabelStyle: React.CSSProperties | undefined;
  if (props.railWidth) {
    portLabelStyle = {
      ["--port-label-width" as string]: `${Math.max(116, props.railWidth - 54)}px`
    };
  }

  return (
    <>
      <div className={`autosar-port-list side-${props.side}`}>
      {props.ports.map((port) => {
        const connections = props.portConnections?.[port.id];
        const hasConnections = Boolean(connections && connections.length > 0);
        const connectionCategory = getPortConnectionCategory(connections);
        const interfaceName = getReferenceLeafName(port.interfaceRef);
        let portClassName = `autosar-port autosar-port-${port.direction} side-${props.side}`;
        if (connectionCategory) {
          portClassName += ` has-${connectionCategory}-connection`;
        }
        if (port.id === props.highlightedPortId) {
          portClassName += " is-highlighted-target";
        }
        if (port.id === props.selectedPortId) {
          portClassName += " is-selected";
        }

        let connectionHandleClassName = "autosar-port-connection-handle";
        if (hasConnections) {
          connectionHandleClassName += " has-connections";
        } else {
          connectionHandleClassName += " is-empty";
        }

        return (
          <div
            key={port.id}
            className={portClassName}
            style={portLabelStyle}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onPortSelect?.(port.id);
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                port,
                interfaceName
              });
            }}
          >
            {/* The AUTOSAR symbol is also the single React Flow connection point for this port. */}
            <Handle
              id={port.id}
              data-autosar-port-id={port.id}
              type={getPortHandleType(port.direction)}
              position={getPortHandlePosition(props.side)}
              className="autosar-port-handle"
              isConnectable={false}
              isConnectableStart={false}
              isConnectableEnd={false}
              role="button"
              tabIndex={0}
              aria-label={`Port ${port.label}`}
              onClick={(event) => {
                event.stopPropagation();
                props.onPortSelect?.(port.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (port.interfaceRef) {
                  props.onPortInterfaceOpen?.(port.interfaceRef);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onPortSelect?.(port.id);
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onPortSelect?.(port.id);
                  if (port.interfaceRef) {
                    props.onPortInterfaceOpen?.(port.interfaceRef);
                  }
                }
              }}
            >
              <PortSymbol
                direction={port.direction}
                interfaceKind={port.interfaceKind}
                className={`autosar-port-symbol-mark side-${props.side}`}
              />
              {interfaceName && (
                <span className="autosar-port-interface-tooltip" role="tooltip">
                  {interfaceName}
                </span>
              )}
            </Handle>
            <div className="autosar-port-text">
              <strong>
                <HighlightedText
                  text={port.label}
                  query={props.searchQuery}
                  active={props.activeSearchKey === `port:${port.id}:label`}
                  searchNodeId={props.searchNodeId}
                  searchKey={`port:${port.id}:label`}
                />
              </strong>
            </div>
            <Handle
              id={getPortConnectionHandleId(port.id)}
              type={getPortConnectionHandleType(port.direction)}
              position={getPortConnectionHandlePosition(props.side)}
              className={connectionHandleClassName}
              isConnectable={false}
              isConnectableStart={false}
              isConnectableEnd={false}
            />
            {hasConnections && (
              <PortConnectionList
                portId={port.id}
                connections={connections}
                highlighted={port.id === props.highlightedPortId}
                onNavigate={props.onConnectionNavigate}
                searchQuery={props.searchQuery}
                activeSearchKey={props.activeSearchKey}
                searchNodeId={props.searchNodeId}
              />
            )}
          </div>
        );
      })}
      </div>
      {contextMenu && (
        <SwcPortContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          port={contextMenu.port}
          interfaceName={contextMenu.interfaceName}
          onClose={closeContextMenu}
          onCopyText={props.onCopyText}
          onOpenDetails={props.onPortDetailsOpen}
          onOpenInterface={props.onPortInterfaceOpen}
        />
      )}
    </>
  );
}

function PortConnectionList(props: {
  portId: string;
  connections: NonNullable<FlowNodeData["portConnections"]>[string] | undefined;
  highlighted: boolean;
  onNavigate?: FlowNodeData["onConnectionNavigate"];
  searchQuery?: string;
  activeSearchKey?: string;
  searchNodeId: string;
}) {
  if (!props.connections || props.connections.length === 0) {
    return null;
  }

  let labelClassName = "autosar-port-connection-label";
  if (props.highlighted) {
    labelClassName += " is-highlighted-target";
  }

  return (
    <span
      className="autosar-port-connection-list"
      onContextMenu={(event) => {
        // Connection labels are navigation controls, not part of the port's
        // context-menu target. Stop the event before it reaches the port row.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {props.connections.map((connection, index) => (
        <span
          key={`${connection.componentName}:${connection.portName}:${index}`}
          className={`${labelClassName} is-${connection.category}`}
          title={getConnectionCategoryTitle(connection.category)}
          onClick={(event) => {
            event.stopPropagation();
            props.onNavigate?.(connection);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            props.onNavigate?.(connection);
          }}
        >
          <span className="autosar-port-connection-component">
            <HighlightedText
              text={connection.componentName}
              query={props.searchQuery}
              active={props.activeSearchKey === `connection:${props.portId}:${index}:component`}
              searchNodeId={props.searchNodeId}
              searchKey={`connection:${props.portId}:${index}:component`}
            />
          </span>
          <span className="autosar-port-connection-port">
            <HighlightedText
              text={connection.portName}
              query={props.searchQuery}
              active={props.activeSearchKey === `connection:${props.portId}:${index}:port`}
              searchNodeId={props.searchNodeId}
              searchKey={`connection:${props.portId}:${index}:port`}
            />
          </span>
        </span>
      ))}
    </span>
  );
}

function getConnectionCategoryTitle(category: "assembly" | "delegation" | "service") {
  if (category === "delegation") {
    return "Delegation connection";
  }
  if (category === "service") {
    return "ECU service connection";
  }
  return "SWC connection";
}

function getPortHandleType(direction: "provided" | "required" | "provided-required") {
  if (direction === "required") {
    return "target" as const;
  }

  // React Flow still requires a declared type in loose mode. A provided-required
  // port is declared as a source, but loose mode also permits incoming edges.
  return "source" as const;
}

function getPortHandlePosition(side: "left" | "right") {
  if (side === "left") {
    return Position.Left;
  }

  return Position.Right;
}

function getPortConnectionHandleType(direction: "provided" | "required" | "provided-required") {
  if (direction === "required") {
    return "source" as const;
  }

  return "target" as const;
}

function getPortConnectionHandlePosition(side: "left" | "right") {
  if (side === "left") {
    return Position.Right;
  }

  return Position.Left;
}

function getReferenceLeafName(reference: string | undefined) {
  if (!reference) {
    return undefined;
  }

  const segments = reference.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? reference;
}
