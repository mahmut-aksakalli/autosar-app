import { Handle, Position } from "@xyflow/react";
import type React from "react";
import type { FlowNodeData } from "./AutosarSwcLayout";

interface AutosarSwcPortsProps {
  ports: FlowNodeData["ports"];
  portConnections?: FlowNodeData["portConnections"];
  compact?: boolean;
  exposeBothHandles?: boolean;
  side?: "left" | "right" | "center";
  railWidth?: number;
  highlightedPortId?: string;
  onConnectionNavigate?: FlowNodeData["onConnectionNavigate"];
}

/** Renders one side of an SWC node, including its React Flow connection handles. */
export function AutosarSwcPorts(props: AutosarSwcPortsProps) {
  const {
    ports,
    portConnections,
    compact = false,
    exposeBothHandles = false,
    side = "left",
    railWidth,
    highlightedPortId,
    onConnectionNavigate
  } = props;

  if (ports.length === 0) {
    return <div className="autosar-node-empty" />;
  }

  let listClassName = `autosar-port-list side-${side}`;
  if (compact) {
    listClassName += " compact";
  }

  let portLabelStyle: React.CSSProperties | undefined;
  if (railWidth && side !== "center") {
    portLabelStyle = {
      ["--port-label-width" as string]: `${Math.max(116, railWidth - 54)}px`
    };
  }

  return (
    <div className={listClassName}>
      {ports.map((port) => {
        let portClassName = `autosar-port autosar-port-${port.direction} side-${side}`;
        if (port.id === highlightedPortId) {
          portClassName += " is-highlighted-target";
        }

        const shouldRenderSecondHandle = !compact || exposeBothHandles;
        return (
          <button
            key={port.id}
            type="button"
            className={portClassName}
            onDoubleClick={(event) => {
              event.stopPropagation();
              const primaryConnection = portConnections?.[port.id]?.[0];
              if (primaryConnection) {
                onConnectionNavigate?.(primaryConnection.targetNodeId, primaryConnection.targetPortId);
              }
            }}
            style={portLabelStyle}
          >
            <Handle
              id={port.id}
              type={getPrimaryHandleType(side)}
              position={getPrimaryHandlePosition(side)}
            />
            <span className="autosar-pin-line" aria-hidden="true" />
            <PortGlyph direction={port.direction} interfaceKind={port.interfaceKind} side={side} />
            <div className="autosar-port-text">
              <strong>{port.label}</strong>
              <PortConnectionList
                connections={portConnections?.[port.id]}
                highlighted={port.id === highlightedPortId}
                onNavigate={onConnectionNavigate}
              />
            </div>
            {shouldRenderSecondHandle && (
              <Handle
                id={port.id}
                type={getSecondaryHandleType(side)}
                position={getSecondaryHandlePosition(side)}
              />
            )}
          </button>
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
  const { connections, highlighted, onNavigate } = props;
  if (!connections || connections.length === 0) {
    return null;
  }

  let labelClassName = "autosar-port-connection-label";
  if (highlighted) {
    labelClassName += " is-highlighted-target";
  }

  return (
    <span className="autosar-port-connection-list">
      {connections.map((connection, index) => (
        <span
          key={`${connection.componentName}:${connection.portName}:${index}`}
          className={labelClassName}
          onClick={(event) => {
            event.stopPropagation();
            onNavigate?.(connection.targetNodeId, connection.targetPortId);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onNavigate?.(connection.targetNodeId, connection.targetPortId);
          }}
        >
          <span className="autosar-port-connection-component">{connection.componentName}</span>
          <span className="autosar-port-connection-port">{connection.portName}</span>
        </span>
      ))}
    </span>
  );
}

function getPrimaryHandleType(side: "left" | "right" | "center") {
  if (side === "right") {
    return "source" as const;
  }
  return "target" as const;
}

function getPrimaryHandlePosition(side: "left" | "right" | "center") {
  if (side === "right") {
    return Position.Right;
  }
  return Position.Left;
}

function getSecondaryHandleType(side: "left" | "right" | "center") {
  if (side === "right") {
    return "target" as const;
  }
  return "source" as const;
}

function getSecondaryHandlePosition(side: "left" | "right" | "center") {
  if (side === "right") {
    return Position.Left;
  }
  return Position.Right;
}

function PortGlyph(props: {
  direction: "provided" | "required" | "provided-required";
  interfaceKind?: string;
  side: "left" | "right" | "center";
}) {
  const { direction, interfaceKind, side } = props;
  const className = `autosar-port-symbol-mark side-${side}`;

  if (interfaceKind === "nv-data") {
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

  if (interfaceKind === "parameter") {
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

  if (interfaceKind === "mode-switch") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M9 4V20" />
        <path d="M23 4V20" />
        <path d="M9 7H18L14 3" />
        <path d="M23 17H14L18 21" />
      </svg>
    );
  }

  if (interfaceKind === "trigger") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M18 2L8 13H15L13 22L24 10H17L18 2Z" />
      </svg>
    );
  }

  if (direction === "provided-required") {
    return (
      <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M2 12H30" />
        <path d="M10 4L2 12L10 20" />
        <path d="M22 4L30 12L22 20" />
      </svg>
    );
  }

  if (interfaceKind === "client-server" && direction === "provided") {
    return (
      <svg className={className} viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="9.5" />
      </svg>
    );
  }

  if (interfaceKind === "client-server" && direction === "required") {
    return (
      <svg className={className} viewBox="0 0 28 28" aria-hidden="true">
        <path d="M10.25 5.75A9.25 9.25 0 1 1 10.25 22.25" />
      </svg>
    );
  }

  if (direction === "provided") {
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
