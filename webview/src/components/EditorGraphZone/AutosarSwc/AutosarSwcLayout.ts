import type { Edge, Node } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { SwcGraphNode, SwcGraphPort, SwcGraphResult } from "../../../../../src/shared/contracts";

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  kind: SwcGraphNode["kind"];
  ports: SwcGraphNode["ports"];
  portConnections?: Record<
    string,
    Array<{
      componentName: string;
      portName: string;
      targetNodeId: string;
      targetPortId: string;
    }>
  >;
  metadata?: Record<string, string>;
  warning?: string;
  secondaryLabel?: string;
  swcKind?: SwcGraphNode["swcKind"];
  highlightedPortId?: string;
  selectedPortId?: string;
  onPortSelect?: (portId: string) => void;
  onPortInterfaceOpen?: (interfaceRef: string) => void;
  onConnectionNavigate?: (nodeId: string, portId: string) => void;
  onCopyText?: (text: string) => void;
  onPortDetailsOpen?: (port: SwcGraphPort) => void;
  onCopyName?: () => void;
  onOpenView?: (view: SwcNodeView) => void;
}

export type FlowNode = Node<FlowNodeData>;
export type SwcNodeView = "graph" | "runnables" | "ports" | "interRunnableVariables" | "parameters";

const PORT_CONNECTION_LIST_EDGE_KIND = "port-connection-list";

const PORT_WIDTH = 170;
const INSTANCE_TOP_Y = 80;
const INSTANCE_X = 120;
const INSTANCE_ROW_GAP = 140;
const INSTANCE_BASE_HEIGHT = 280;
const INSTANCE_PORT_SPACING = 52;
const INSTANCE_PORT_MARGIN = 96;
const DEFAULT_BODY_WIDTH = 430;
const COMPOSITION_PADDING_X = 120;
const COMPOSITION_PADDING_Y = 44;
const COMPOSITION_BOTTOM_MARGIN = 80;
const CONNECTION_LABEL_ANCHOR_OFFSET = 220;
const CONNECTION_LABEL_STEM_WIDTH = 100;
const CONNECTION_LABEL_GAP = 6;
const CONNECTION_PILL_PADDING = 24;
const CONNECTION_CHAR_WIDTH = 7.2;
const HEADER_FIXED_WIDTH = 230;
const HEADER_LABEL_CHAR_WIDTH = 11;

export function layoutSwcGraph(graph: SwcGraphResult): { nodes: FlowNode[]; edges: Edge[] } {
  const instanceNodes = graph.nodes.filter((node) => node.kind === "instance");
  const componentNodes = graph.nodes.filter((node) => node.kind === "swc" || node.kind === "composition");
  const portConnections = buildPortConnectionLabels(graph);

  const flowNodes: FlowNode[] = [];
  let nextInstanceY = INSTANCE_TOP_Y;
  const instanceMetrics = new Map<
    string,
    {
      x: number;
      y: number;
      height: number;
      totalWidth: number;
      leftExtension: number;
      rightExtension: number;
    }
  >();

  instanceNodes.forEach((node) => {
    const estimatedHeight = getEstimatedInstanceHeight(node);
    const estimatedWidth = getEstimatedNodeWidth(node);
    const leftExtension = getConnectionLabelExtension(node, portConnections[node.id], "left");
    const rightExtension = getConnectionLabelExtension(node, portConnections[node.id], "right");
    instanceMetrics.set(node.id, {
      x: INSTANCE_X,
      y: nextInstanceY,
      height: estimatedHeight,
      totalWidth: estimatedWidth,
      leftExtension,
      rightExtension
    });
    nextInstanceY += estimatedHeight + INSTANCE_ROW_GAP;
  });

  const compositionBounds = getCompositionBounds(instanceMetrics);
  const shouldRenderCompositionContainer = graph.scope === "composition" && instanceNodes.length > 0;

  componentNodes.forEach((node) => {
    const compositionRailWidth = getNodeRailWidth(node.ports);
    const compositionWidth = compositionBounds ? compositionBounds.width : getEstimatedNodeWidth(node);
    const compositionBodyWidth = Math.max(
      340,
      compositionWidth - compositionRailWidth * 2,
      getEstimatedBodyWidth(node)
    );
    const position =
      shouldRenderCompositionContainer && node.kind === "composition"
        ? { x: compositionBounds?.x ?? 40, y: compositionBounds?.y ?? 140 }
        : { x: 340, y: 140 };
    flowNodes.push({
      id: node.id,
      type: "autosarNode",
      position,
      style:
        shouldRenderCompositionContainer && node.kind === "composition"
          ? ({
              zIndex: 0,
              ["--autosar-rail-width" as string]: `${compositionRailWidth}px`,
              ["--autosar-body-width" as string]: `${compositionBodyWidth}px`,
              ["--autosar-node-min-height" as string]: `${compositionBounds?.height ?? INSTANCE_BASE_HEIGHT}px`
            } as CSSProperties)
          : ({
              zIndex: 2,
              ["--autosar-body-width" as string]: `${getEstimatedBodyWidth(node)}px`
            } as CSSProperties),
      data: {
        label: node.label,
        kind: node.kind,
        ports: node.ports,
        metadata: node.metadata,
        warning: node.warning,
        secondaryLabel: node.semanticPath,
        swcKind: node.swcKind
      }
    });
  });

  nextInstanceY = INSTANCE_TOP_Y;

  instanceNodes.forEach((node) => {
    const metrics = instanceMetrics.get(node.id);
    const estimatedHeight = metrics?.height ?? getEstimatedInstanceHeight(node);
    flowNodes.push({
      id: node.id,
      type: "autosarNode",
      position: {
        x: metrics?.x ?? INSTANCE_X,
        y: metrics?.y ?? nextInstanceY
      },
      style: {
        zIndex: 2,
        ["--autosar-body-width" as string]: `${getEstimatedBodyWidth(node)}px`
      },
      data: {
        label: node.label,
        kind: node.kind,
        ports: node.ports,
        metadata: node.metadata,
        warning: node.warning,
        secondaryLabel: node.typeRef,
        swcKind: node.swcKind
      }
    });

    nextInstanceY += estimatedHeight + INSTANCE_ROW_GAP;
  });

  const graphEdges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    type: "step",
    animated: false,
    style: {
      stroke: edge.warning ? "#b64a36" : "#a13131",
      strokeWidth: edge.kind === "delegation" ? 2 : 1.8
    },
    labelStyle: {
      fill: "#8a1f1f",
      fontSize: 10,
      fontWeight: 400,
      fontFamily: "\"Cascadia Mono\", Consolas, \"Courier New\", monospace"
    },
    labelBgStyle: {
      fill: "#fffdf6",
      fillOpacity: 1
    }
  }));

  return {
    nodes: flowNodes,
    edges: [...graphEdges, ...buildPortConnectionListEdges(graph.nodes)]
  };
}

/** Returns the handle that anchors a port's off-canvas connection summary. */
export function getPortConnectionHandleId(portId: string) {
  return `${portId}:connection-list`;
}

/** Identifies the short display edge between a port symbol and its connection list. */
export function isPortConnectionListEdge(edge: Edge) {
  return edge.data?.kind === PORT_CONNECTION_LIST_EDGE_KIND;
}

/**
 * Creates a short self-edge for every port. The two handles belong to the same
 * SWC node: one is the port symbol and the other sits beside its connection list.
 */
function buildPortConnectionListEdges(nodes: SwcGraphNode[]): Edge[] {
  const edges: Edge[] = [];

  for (const node of nodes) {
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
          stroke: "#a13131",
          strokeWidth: 1.5
        }
      });
    }
  }

  return edges;
}

function getEstimatedInstanceHeight(node: SwcGraphNode) {
  const leftPorts = node.ports.filter((port) => port.direction === "required").length;
  const rightPorts = node.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  ).length;
  const tallestRailCount = Math.max(leftPorts, rightPorts, 1);

  return Math.max(
    INSTANCE_BASE_HEIGHT,
    INSTANCE_PORT_MARGIN * 2 + (tallestRailCount - 1) * INSTANCE_PORT_SPACING + 48
  );
}

function getEstimatedNodeWidth(node: SwcGraphNode) {
  const requiredPorts = node.ports.filter((port) => port.direction === "required");
  const providedPorts = node.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  return getPortRailWidth(requiredPorts) + getEstimatedBodyWidth(node) + getPortRailWidth(providedPorts);
}

function getEstimatedBodyWidth(node: SwcGraphNode) {
  const estimatedHeaderWidth = HEADER_FIXED_WIDTH + node.label.length * HEADER_LABEL_CHAR_WIDTH;
  return Math.max(DEFAULT_BODY_WIDTH, estimatedHeaderWidth);
}

function getNodeRailWidth(ports: SwcGraphNode["ports"]) {
  return getPortRailWidth(ports);
}

export function getPortRailWidth(ports: SwcGraphPort[]) {
  const longestLabelLength = ports.reduce((max, port) => Math.max(max, port.label.length), 0);
  const estimatedTextWidth = longestLabelLength * 8;
  return Math.max(170, Math.min(320, estimatedTextWidth + 54));
}

function getCompositionBounds(
  instanceMetrics: Map<
    string,
    {
      x: number;
      y: number;
      height: number;
      totalWidth: number;
      leftExtension: number;
      rightExtension: number;
    }
  >
) {
  const metrics = Array.from(instanceMetrics.values());
  if (metrics.length === 0) {
    return undefined;
  }

  const left = Math.min(...metrics.map((entry) => entry.x - entry.leftExtension)) - COMPOSITION_PADDING_X;
  const top = Math.min(...metrics.map((entry) => entry.y)) - COMPOSITION_PADDING_Y;
  const right = Math.max(...metrics.map((entry) => entry.x + entry.totalWidth + entry.rightExtension)) + COMPOSITION_PADDING_X;
  const bottom =
    Math.max(...metrics.map((entry) => entry.y + entry.height)) +
    COMPOSITION_PADDING_Y +
    COMPOSITION_BOTTOM_MARGIN;

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function getConnectionLabelExtension(
  node: SwcGraphNode,
  connectionMap: NonNullable<FlowNodeData["portConnections"]> | undefined,
  side: "left" | "right"
) {
  const relevantPorts = node.ports.filter((port) =>
    side === "left" ? port.direction === "required" : port.direction !== "required"
  );
  let extension = 0;

  for (const port of relevantPorts) {
    const connections = connectionMap?.[port.id];
    if (!connections || connections.length === 0) {
      continue;
    }

    extension = Math.max(
      extension,
      CONNECTION_LABEL_ANCHOR_OFFSET + CONNECTION_LABEL_STEM_WIDTH + estimateConnectionListWidth(connections)
    );
  }

  return extension;
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
