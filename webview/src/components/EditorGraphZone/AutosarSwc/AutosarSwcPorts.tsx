import { Handle, Position } from "@xyflow/react";
import type React from "react";
import { getPortConnectionHandleId, type FlowNodeData } from "./AutosarSwcLayout";

interface AutosarSwcPortsProps {
  ports: FlowNodeData["ports"];
  portConnections?: FlowNodeData["portConnections"];
  side: "left" | "right";
  railWidth?: number;
  highlightedPortId?: string;
  onConnectionNavigate?: FlowNodeData["onConnectionNavigate"];
}

/** Renders one side of an SWC node, including its React Flow connection handles. */
export function AutosarSwcPorts(props: AutosarSwcPortsProps) {
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
    <div className={`autosar-port-list side-${props.side}`}>
      {props.ports.map((port) => {
        const connections = props.portConnections?.[port.id];
        const hasConnections = Boolean(connections && connections.length > 0);
        let portClassName = `autosar-port autosar-port-${port.direction} side-${props.side}`;
        if (port.id === props.highlightedPortId) {
          portClassName += " is-highlighted-target";
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
          >
            {/* The AUTOSAR symbol is also the single React Flow connection point for this port. */}
            <Handle
              id={port.id}
              type={getPortHandleType(port.direction)}
              position={getPortHandlePosition(props.side)}
              className="autosar-port-handle"
            >
              <PortSymbol
                direction={port.direction}
                interfaceKind={port.interfaceKind}
                side={props.side}
              />
            </Handle>
            <div className="autosar-port-text">
              <strong>{port.label}</strong>
            </div>
            <Handle
              id={getPortConnectionHandleId(port.id)}
              type={getPortConnectionHandleType(port.direction)}
              position={getPortConnectionHandlePosition(props.side)}
              className={connectionHandleClassName}
            />
            {hasConnections && (
              <PortConnectionList
                connections={connections}
                highlighted={port.id === props.highlightedPortId}
                onNavigate={props.onConnectionNavigate}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortConnectionList(props: {
  connections: NonNullable<FlowNodeData["portConnections"]>[string] | undefined;
  highlighted: boolean;
  onNavigate?: FlowNodeData["onConnectionNavigate"];
}) {
  if (!props.connections || props.connections.length === 0) {
    return null;
  }

  let labelClassName = "autosar-port-connection-label";
  if (props.highlighted) {
    labelClassName += " is-highlighted-target";
  }

  return (
    <span className="autosar-port-connection-list">
      {props.connections.map((connection, index) => (
        <span
          key={`${connection.componentName}:${connection.portName}:${index}`}
          className={labelClassName}
          onClick={(event) => {
            event.stopPropagation();
            props.onNavigate?.(connection.targetNodeId, connection.targetPortId);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            props.onNavigate?.(connection.targetNodeId, connection.targetPortId);
          }}
        >
          <span className="autosar-port-connection-component">{connection.componentName}</span>
          <span className="autosar-port-connection-port">{connection.portName}</span>
        </span>
      ))}
    </span>
  );
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
    return Position.Left;
  }

  return Position.Right;
}

function PortSymbol(props: {
  direction: "provided" | "required" | "provided-required";
  interfaceKind?: string;
  side: "left" | "right";
}) {
  const className = `autosar-port-symbol-mark side-${props.side}`;

  if (props.interfaceKind === "nv-data") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <ellipse cx="16" cy="6" rx="9" ry="3.5" />
        <path d="M7 6V18" />
        <path d="M25 6V18" />
        <path d="M7 12C7 13.9 11 15.5 16 15.5C21 15.5 25 13.9 25 12" />
        <path d="M7 18C7 19.9 11 21.5 16 21.5C21 21.5 25 19.9 25 18" />
      </svg>
    );
  }

  if (props.interfaceKind === "parameter") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M4 6H28" />
        <path d="M4 12H28" />
        <path d="M4 18H28" />
        <circle cx="11" cy="6" r="2.5" />
        <circle cx="21" cy="12" r="2.5" />
        <circle cx="15" cy="18" r="2.5" />
      </svg>
    );
  }

  if (props.interfaceKind === "mode-switch") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M9 4V20" />
        <path d="M23 4V20" />
        <path d="M9 7H18L14 3" />
        <path d="M23 17H14L18 21" />
      </svg>
    );
  }

  if (props.interfaceKind === "trigger") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M18 2L8 13H15L13 22L24 10H17L18 2Z" />
      </svg>
    );
  }

  if (props.direction === "provided-required") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M2 12H30" />
        <path d="M10 4L2 12L10 20" />
        <path d="M22 4L30 12L22 20" />
      </svg>
    );
  }

  if (props.interfaceKind === "client-server" && props.direction === "provided") {
    return (
      <svg className={className} viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="9.5" />
      </svg>
    );
  }

  if (props.interfaceKind === "client-server" && props.direction === "required") {
    return (
      <svg className={className} viewBox="0 0 28 28" aria-hidden="true">
        <path d="M10.25 5.75A9.25 9.25 0 1 1 10.25 22.25" />
      </svg>
    );
  }

  if (props.direction === "provided") {
    return (
      <svg className={className} viewBox="0 0 28 22" aria-hidden="true">
        <path d="M3 2L22 11L3 20Z" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 28 22" aria-hidden="true">
      <path d="M3 2L22 11L3 20Z" />
    </svg>
  );
}
