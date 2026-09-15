import { Handle, Position, type NodeProps, type OnEdgesChange, type OnNodesChange } from "@xyflow/react";
import type React from "react";
import type {
  AutosarEntity,
  SwcGraphNode,
  SwcGraphResult,
  SwcGraphScope
} from "../../../src/shared/contracts";
import type { FlowNode, FlowNodeData } from "../model/graphLayout";

const PORT_WIDTH = 170;
const CONNECTION_LABEL_ANCHOR_OFFSET = 220;
const CONNECTION_LABEL_STEM_WIDTH = 100;
const CONNECTION_LABEL_GAP = 6;
const CONNECTION_PILL_PADDING = 24;
const CONNECTION_CHAR_WIDTH = 7.2;
const GRAPH_FALLBACK_BODY_WIDTH = 430;
const GRAPH_FALLBACK_BASE_HEIGHT = 280;
const GRAPH_FALLBACK_PORT_MARGIN = 96;
const GRAPH_FALLBACK_PORT_SPACING = 52;

export function AutosarFlowNode({ data }: NodeProps<FlowNode>) {
  const providedPorts = data.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  const requiredPorts = data.ports.filter((port) => port.direction === "required");
  const leftRailWidth = getPortRailWidth(requiredPorts);
  const rightRailWidth = getPortRailWidth(providedPorts);

  if (data.kind === "port") {
    let portSide: "left" | "right" = "left";
    if (data.ports[0]?.direction === "provided") {
      portSide = "right";
    }

    return (
      <div className="autosar-node autosar-node-port">
        <div className="autosar-port-symbol">
          <div className="autosar-node-header autosar-node-header-port">
            <strong>{data.label}</strong>
          </div>
          {data.secondaryLabel && <div className="autosar-node-subtitle">{data.secondaryLabel}</div>}
          {data.warning && <div className="autosar-node-warning">{data.warning}</div>}
          <PortList
            ports={data.ports}
            portConnections={data.portConnections}
            compact
            exposeBothHandles
            side={portSide}
            highlightedPortId={data.highlightedPortId}
            onConnectionNavigate={data.onConnectionNavigate}
          />
        </div>
      </div>
    );
  }

  let kindLabel = formatSwcKindLabel(data.swcKind);
  if (data.kind === "composition") {
    kindLabel = "Composition";
  }

  return (
    <div className={`autosar-node autosar-node-${data.kind}`}>
      <div className="autosar-symbol">
        <div className="autosar-symbol-rail autosar-symbol-rail-left">
          <PortList
            ports={requiredPorts}
            portConnections={data.portConnections}
            side="left"
            railWidth={leftRailWidth}
            highlightedPortId={data.highlightedPortId}
            onConnectionNavigate={data.onConnectionNavigate}
          />
        </div>
        <div className="autosar-symbol-body">
          <div className="autosar-node-header">
            <div className="autosar-node-badges">
              <span className="autosar-node-badge">
                <span className="autosar-family-glyph" aria-hidden="true">
                  {formatSwcKindGlyph(data.swcKind)}
                </span>
                {kindLabel}
                  </span>
            </div>
            <strong>{data.label}</strong>
          </div>
          {data.secondaryLabel && <div className="autosar-node-subtitle">{data.secondaryLabel}</div>}
          {data.warning && <div className="autosar-node-warning">{data.warning}</div>}
        </div>
        <div className="autosar-symbol-rail autosar-symbol-rail-right">
          <PortList
            ports={providedPorts}
            portConnections={data.portConnections}
            side="right"
            railWidth={rightRailWidth}
            highlightedPortId={data.highlightedPortId}
            onConnectionNavigate={data.onConnectionNavigate}
          />
        </div>
      </div>
    </div>
  );
}

function PortList(props: {
  ports: FlowNodeData["ports"];
  portConnections?: FlowNodeData["portConnections"];
  compact?: boolean;
  exposeBothHandles?: boolean;
  side?: "left" | "right" | "center";
  railWidth?: number;
  highlightedPortId?: string;
  onConnectionNavigate?: FlowNodeData["onConnectionNavigate"];
}) {
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

export const noopNodesChange: OnNodesChange = () => undefined;
export const noopEdgesChange: OnEdgesChange = () => undefined;

function getPortRailWidth(ports: FlowNodeData["ports"]) {
  const longestLabelLength = ports.reduce((max, port) => Math.max(max, port.label.length), 0);
  const estimatedTextWidth = longestLabelLength * 8;
  return Math.max(170, Math.min(320, estimatedTextWidth + 54));
}

export function getIsolatedRailWidth(
  node: FlowNode,
  portConnectionMap: NonNullable<FlowNodeData["portConnections"]> | undefined,
  side: "left" | "right"
) {
  const ports = node.data.ports.filter((port) =>
    side === "left" ? port.direction === "required" : port.direction !== "required"
  );
  const baseRailWidth = getPortRailWidth(ports);
  let connectionExtension = 0;

  for (const port of ports) {
    const connections = portConnectionMap?.[port.id];
    if (!connections || connections.length === 0) {
      continue;
    }

    connectionExtension = Math.max(
      connectionExtension,
      CONNECTION_LABEL_ANCHOR_OFFSET + CONNECTION_LABEL_STEM_WIDTH + estimateConnectionListWidth(connections)
    );
  }

  return Math.max(baseRailWidth, PORT_WIDTH + connectionExtension);
}

function estimateConnectionListWidth(
  connections: Array<{
    componentName: string;
    portName: string;
  }>
) {
  return connections.reduce((total, connection, index) => {
    const componentWidth =
      connection.componentName.length * CONNECTION_CHAR_WIDTH + CONNECTION_PILL_PADDING;
    const portWidth = connection.portName.length * CONNECTION_CHAR_WIDTH + CONNECTION_PILL_PADDING;
    const pairWidth = componentWidth + portWidth - 1;
    return total + pairWidth + (index > 0 ? CONNECTION_LABEL_GAP : 0);
  }, 0);
}

export function getEstimatedFlowNodeWidth(node: FlowNode) {
  const requiredPorts = node.data.ports.filter((port) => port.direction === "required");
  const providedPorts = node.data.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  const style = (node.style ?? {}) as Record<string, string | number | undefined>;
  const leftRailWidth = readPixelStyleValue(style["--autosar-left-rail-width"]) ?? getPortRailWidth(requiredPorts);
  const rightRailWidth = readPixelStyleValue(style["--autosar-right-rail-width"]) ?? getPortRailWidth(providedPorts);
  const bodyWidth = readPixelStyleValue(style["--autosar-body-width"]) ?? GRAPH_FALLBACK_BODY_WIDTH;

  return leftRailWidth + bodyWidth + rightRailWidth;
}

export function getEstimatedFlowNodeHeight(node: FlowNode) {
  const style = (node.style ?? {}) as Record<string, string | number | undefined>;
  const styleHeight = readPixelStyleValue(style["--autosar-node-min-height"]);
  if (styleHeight) {
    return styleHeight;
  }

  const leftPorts = node.data.ports.filter((port) => port.direction === "required").length;
  const rightPorts = node.data.ports.filter((port) => port.direction !== "required").length;
  const tallestRailCount = Math.max(leftPorts, rightPorts, 1);
  return Math.max(
    GRAPH_FALLBACK_BASE_HEIGHT,
    GRAPH_FALLBACK_PORT_MARGIN * 2 + (tallestRailCount - 1) * GRAPH_FALLBACK_PORT_SPACING + 48
  );
}

export function getFocusedNodeBounds(
  node: FlowNode,
  position: { x: number; y: number },
  width: number,
  height: number,
  highlightedPortId: string | undefined
) {
  const highlightedPort = highlightedPortId
    ? node.data.ports.find((port) => port.id === highlightedPortId)
    : undefined;
  const highlightedConnections = highlightedPort ? node.data.portConnections?.[highlightedPort.id] : undefined;
  const visualExtension = highlightedConnections
    ? CONNECTION_LABEL_ANCHOR_OFFSET + CONNECTION_LABEL_STEM_WIDTH + estimateConnectionListWidth(highlightedConnections)
    : 0;
  const sidePadding = visualExtension > 0 ? Math.min(visualExtension, 520) : 0;
  const verticalPadding = highlightedPort ? 80 : 40;

  if (highlightedPort?.direction === "required") {
    return {
      x: position.x - sidePadding,
      y: position.y - verticalPadding,
      width: width + sidePadding + 48,
      height: height + verticalPadding * 2
    };
  }

  if (highlightedPort) {
    return {
      x: position.x - 48,
      y: position.y - verticalPadding,
      width: width + sidePadding + 48,
      height: height + verticalPadding * 2
    };
  }

  return {
    x: position.x - 40,
    y: position.y - 40,
    width: width + 80,
    height: height + 80
  };
}

export function getFocusedNodeZoom(
  bounds: { width: number; height: number },
  canvasRect: DOMRect | undefined,
  shouldIsolateCompositionNode: boolean
) {
  const maxZoom = shouldIsolateCompositionNode ? 0.72 : 0.82;
  const minZoom = 0.35;
  if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return maxZoom;
  }

  const horizontalZoom = (canvasRect.width * 0.86) / bounds.width;
  const verticalZoom = (canvasRect.height * 0.82) / bounds.height;
  return Math.max(minZoom, Math.min(maxZoom, horizontalZoom, verticalZoom));
}

function readPixelStyleValue(value: string | number | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildPortConnectionLabels(
  graph: SwcGraphResult
): Record<string, NonNullable<FlowNodeData["portConnections"]>> {
  const labelsByNode: Record<string, NonNullable<FlowNodeData["portConnections"]>> = {};
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const edge of graph.edges) {
    if (edge.kind !== "assembly") {
      continue;
    }

    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourcePort = sourceNode?.ports.find((port) => port.id === edge.sourceHandle);
    const targetPort = targetNode?.ports.find((port) => port.id === edge.targetHandle);

    if (sourceNode && sourcePort && targetNode && targetPort) {
      const sourceLabels = (labelsByNode[sourceNode.id] ??= {});
      const sourceConnections = (sourceLabels[sourcePort.id] ??= []);
      sourceConnections.push({
        componentName: targetNode.label,
        portName: targetPort.label,
        targetNodeId: targetNode.id,
        targetPortId: targetPort.id
      });

      const targetLabels = (labelsByNode[targetNode.id] ??= {});
      const targetConnections = (targetLabels[targetPort.id] ??= []);
      targetConnections.push({
        componentName: sourceNode.label,
        portName: sourcePort.label,
        targetNodeId: sourceNode.id,
        targetPortId: sourcePort.id
      });
    }
  }

  return labelsByNode;
}

export function resolveInitialSelection(
  graph: SwcGraphResult,
  activeCompositionNodeId: string | undefined,
  preferredNodeId: string | undefined
) {
  if (activeCompositionNodeId && graph.nodes.some((node) => node.id === activeCompositionNodeId)) {
    return activeCompositionNodeId;
  }
  if (preferredNodeId && graph.nodes.some((node) => node.id === preferredNodeId)) {
    return preferredNodeId;
  }
  if (graph.scope === "composition") {
    return (
      graph.nodes.find((node) => node.kind === "composition")?.id ??
      graph.nodes.find((node) => node.kind === "instance" && node.inspector)?.id ??
      graph.nodes.find((node) => node.inspector)?.id ??
      graph.nodes[0]?.id
    );
  }
  return (
    graph.nodes.find((node) => node.kind === "swc" && node.inspector)?.id ??
    graph.nodes.find((node) => node.inspector)?.id ??
    graph.nodes[0]?.id
  );
}

export function makeGraphCacheKey(
  workspaceRevision: string | undefined,
  scope: SwcGraphScope,
  focusId: string,
  includeCompositionInternals: boolean
) {
  return `${workspaceRevision ?? "workspace"}:${scope}:${includeCompositionInternals ? "internals" : "surface"}:${focusId}`;
}

export function resolveFallbackInspector(
  graphResult: SwcGraphResult | undefined,
  focusEntity: AutosarEntity | undefined
) {
  if (!graphResult) {
    return focusEntity?.inspector;
  }
  return graphResult.nodes.find((node) => node.inspector)?.inspector ?? focusEntity?.inspector;
}

function formatSwcKindLabel(kind: SwcGraphNode["swcKind"]) {
  switch (kind) {
    case "application":
      return "Application SWC";
    case "parameter":
      return "Parameter SWC";
    case "sensor-actuator":
      return "Sensor/Actuator SWC";
    case "ecu-abstraction":
      return "ECU Abstraction SWC";
    case "complex-device-driver":
      return "Complex Driver SWC";
    case "service":
      return "Service SWC";
    case "service-proxy":
      return "Service Proxy SWC";
    case "nv-block":
      return "NvBlock SWC";
    default:
      return "SWC";
  }
}

function formatSwcKindGlyph(kind: SwcGraphNode["swcKind"]) {
  switch (kind) {
    case "service":
      return "S";
    case "sensor-actuator":
      return "A";
    case "ecu-abstraction":
      return "E";
    case "complex-device-driver":
      return "D";
    case "nv-block":
      return "N";
    case "parameter":
      return "P";
    case "service-proxy":
      return "X";
    case "application":
      return "C";
    default:
      return "G";
  }
}
