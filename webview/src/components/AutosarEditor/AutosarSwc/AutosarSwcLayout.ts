import type { Edge, Node } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { SwcGraphNode, SwcGraphPort, SwcGraphResult } from "../../../../../src/shared/contracts";

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  kind: SwcGraphNode["kind"];
  ports: SwcGraphNode["ports"];
  portConnections?: Record<string, PortConnectionLabel[]>;
  metadata?: Record<string, string>;
  warning?: string;
  secondaryLabel?: string;
  swcKind?: SwcGraphNode["swcKind"];
  isRootCompositionInstance?: boolean;
  highlightedPortId?: string;
  selectedPortId?: string;
  onPortSelect?: (portId: string) => void;
  onPortInterfaceOpen?: (interfaceRef: string) => void;
  onConnectionNavigate?: (connection: PortConnectionLabel) => void;
  onCopyText?: (text: string) => void;
  onPortDetailsOpen?: (port: SwcGraphPort) => void;
  onCopyName?: () => void;
  onOpenView?: (view: SwcNodeView) => void;
  searchQuery?: string;
  activeSearchKey?: string;
  isSearchMatch?: boolean;
}

export interface PortConnectionLabel {
  componentName: string;
  portName: string;
  targetNodeId: string;
  targetPortId: string;
  category: "assembly" | "delegation" | "service";
  targetCompositionId?: string;
  targetCompositionContextPaths?: string[];
  targetTreeNodeId?: string;
}

export type FlowNode = Node<FlowNodeData>;
export type SwcNodeView = "graph" | "runnables" | "ports" | "interRunnableVariables" | "parameters";

const PORT_CONNECTION_LIST_EDGE_KIND = "port-connection-list";

const PORT_WIDTH = 170;
const INSTANCE_BASE_HEIGHT = 280;
const INSTANCE_PORT_SPACING = 52;
const INSTANCE_PORT_MARGIN = 96;
const DEFAULT_BODY_WIDTH = 430;
const CONNECTION_LABEL_ANCHOR_OFFSET = 220;
const CONNECTION_LABEL_STEM_WIDTH = 100;
const CONNECTION_LABEL_GAP = 6;
const CONNECTION_PILL_PADDING = 24;
const CONNECTION_CHAR_WIDTH = 7.2;
const HEADER_FIXED_WIDTH = 230;
const HEADER_LABEL_CHAR_WIDTH = 11;

/** The canvas displays one node; other graph nodes only resolve connection labels. */
export function layoutVisibleSwcNode(
  graph: SwcGraphResult,
  visibleNodeId: string | undefined
): { nodes: FlowNode[]; edges: Edge[] } {
  const visibleNode = graph.nodes.find((node) => node.id === visibleNodeId);
  if (!visibleNode) {
    return { nodes: [], edges: [] };
  }

  const node: FlowNode = {
    id: visibleNode.id,
    type: "autosarNode",
    position: { x: 0, y: 0 },
    style: {
      zIndex: 2,
      ["--autosar-body-width" as string]: `${getEstimatedBodyWidth(visibleNode)}px`
    } as CSSProperties,
    data: {
      label: visibleNode.label,
      kind: visibleNode.kind,
      ports: visibleNode.ports,
      metadata: visibleNode.metadata,
      warning: visibleNode.warning,
      secondaryLabel: visibleNode.kind === "instance" ? visibleNode.typeRef : visibleNode.semanticPath,
      swcKind: visibleNode.swcKind
    }
  };

  return { nodes: [node], edges: buildPortConnectionListEdges(graph, visibleNode.id) };
}

/** Returns the handle that anchors a port's off-canvas connection summary. */
export function getPortConnectionHandleId(portId: string) {
  return `${portId}:connection-list`;
}

/**
 * Creates a short self-edge for every port. The two handles belong to the same
 * SWC node: one is the port symbol and the other sits beside its connection list.
 */
function buildPortConnectionListEdges(graph: SwcGraphResult, visibleNodeId?: string): Edge[] {
  const edges: Edge[] = [];
  const portConnections = buildPortConnectionLabels(graph);

  for (const node of graph.nodes) {
    if (visibleNodeId && node.id !== visibleNodeId) {
      continue;
    }
    for (const port of node.ports) {
      const connectionHandleId = getPortConnectionHandleId(port.id);
      let sourceHandle = port.id;
      let targetHandle = connectionHandleId;

      if (port.direction === "required") {
        sourceHandle = connectionHandleId;
        targetHandle = port.id;
      }

      edges.push({
        id: `${node.id}:${port.id}:connection-list-edge`,
        source: node.id,
        target: node.id,
        sourceHandle,
        targetHandle,
        type: "straight",
        selectable: false,
        focusable: false,
        zIndex: 3,
        data: {
          kind: PORT_CONNECTION_LIST_EDGE_KIND
        },
        style: {
          stroke: getConnectionColor(portConnections[node.id]?.[port.id]),
          strokeWidth: 1.5
        }
      });
    }
  }

  return edges;
}

function getConnectionColor(connections: PortConnectionLabel[] | undefined) {
  const category = getPortConnectionCategory(connections);
  if (category === "service") {
    return "#217a9a";
  }
  if (category === "delegation") {
    return "#7656a5";
  }
  return "#a13131";
}

/** Use one priority for the edge and the port's interaction color. */
export function getPortConnectionCategory(connections: PortConnectionLabel[] | undefined) {
  if (connections?.some((connection) => connection.category === "service")) {
    return "service";
  }
  if (connections?.some((connection) => connection.category === "delegation")) {
    return "delegation";
  }
  if (connections?.length) {
    return "assembly";
  }
  return undefined;
}

function getEstimatedBodyWidth(node: SwcGraphNode) {
  const estimatedHeaderWidth = HEADER_FIXED_WIDTH + node.label.length * HEADER_LABEL_CHAR_WIDTH;
  return Math.max(DEFAULT_BODY_WIDTH, estimatedHeaderWidth);
}

export function getPortRailWidth(ports: SwcGraphPort[]) {
  const longestLabelLength = ports.reduce((max, port) => Math.max(max, port.label.length), 0);
  const estimatedTextWidth = longestLabelLength * 8;
  return Math.max(170, Math.min(320, estimatedTextWidth + 54));
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

export function buildPortConnectionLabels(
  graph: SwcGraphResult
): Record<string, NonNullable<FlowNodeData["portConnections"]>> {
  const labelsByNode: Record<string, NonNullable<FlowNodeData["portConnections"]>> = {};
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const edge of graph.edges) {
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
        targetPortId: targetPort.id,
        category: edge.kind === "delegation" ? "delegation" : edge.connectionCategory ?? "assembly"
      });

      // Delegation points outward from an inner SWC to its composition port
      // prototype. The prototype must not show a purple back-reference: its
      // outward connections belong to the parent composition graph instead.
      if (edge.kind !== "delegation") {
        const targetLabels = (labelsByNode[targetNode.id] ??= {});
        const targetConnections = (targetLabels[targetPort.id] ??= []);
        targetConnections.push({
          componentName: sourceNode.label,
          portName: sourcePort.label,
          targetNodeId: sourceNode.id,
          targetPortId: sourcePort.id,
          category: edge.connectionCategory ?? "assembly"
        });
      }
    }
  }

  for (const connection of graph.externalConnections ?? []) {
    const nodeLabels = (labelsByNode[connection.nodeId] ??= {});
    const portLabels = (nodeLabels[connection.portId] ??= []);
    portLabels.push({
      componentName: connection.componentName,
      portName: connection.portName,
      targetNodeId: connection.targetNodeId,
      targetPortId: connection.targetPortId,
      targetCompositionId: connection.targetCompositionId,
      targetCompositionContextPaths: connection.targetCompositionContextPaths,
      targetTreeNodeId: connection.targetTreeNodeId,
      category: "service"
    });
  }

  return labelsByNode;
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

export function getEstimatedFlowNodeWidth(node: FlowNode) {
  const requiredPorts = node.data.ports.filter((port) => port.direction === "required");
  const providedPorts = node.data.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  const style = (node.style ?? {}) as Record<string, string | number | undefined>;
  const leftRailWidth = readPixelStyleValue(style["--autosar-left-rail-width"]) ?? getPortRailWidth(requiredPorts);
  const rightRailWidth = readPixelStyleValue(style["--autosar-right-rail-width"]) ?? getPortRailWidth(providedPorts);
  const bodyWidth = readPixelStyleValue(style["--autosar-body-width"]) ?? DEFAULT_BODY_WIDTH;

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
    INSTANCE_BASE_HEIGHT,
    INSTANCE_PORT_MARGIN * 2 + (tallestRailCount - 1) * INSTANCE_PORT_SPACING + 48
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
  // The node's rail widths already reserve room for connection summaries.
  // Adding their length again here zooms out far beyond the visible content.
  const verticalPadding = highlightedPort ? 80 : 40;
  return {
    x: position.x - 48,
    y: position.y - verticalPadding,
    width: width + 96,
    height: height + verticalPadding * 2
  };
}

export function getFocusedNodeZoom(
  bounds: { width: number; height: number },
  canvasRect: DOMRect | undefined,
  shouldIsolateCompositionNode: boolean
) {
  const maxZoom = shouldIsolateCompositionNode ? 0.95 : 1.1;
  const minZoom = 0.08;
  if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return maxZoom;
  }

  const horizontalZoom = (canvasRect.width * 0.86) / bounds.width;
  const verticalZoom = (canvasRect.height * 0.82) / bounds.height;
  return Math.max(minZoom, Math.min(maxZoom, horizontalZoom, verticalZoom));
}

/** Keep an individual destination port readable when the full SWC is too tall to fit. */
export function getTallNodePortZoom(
  nodeHeight: number,
  visibleCanvasHeight: number
) {
  if (visibleCanvasHeight <= 0) {
    return undefined;
  }

  const preferredZoom = 0.85;
  const visibleHeight = visibleCanvasHeight * 0.82;
  if (nodeHeight * preferredZoom <= visibleHeight) {
    return undefined;
  }

  return preferredZoom;
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
