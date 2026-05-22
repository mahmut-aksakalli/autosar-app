import type { Edge, Node } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { SwcGraphEdge, SwcGraphNode, SwcGraphPort, SwcGraphResult } from "../shared/contracts";

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
  onPortDoubleClick?: (filePath: string, xmlPath?: string) => void | Promise<void>;
  onConnectionNavigate?: (nodeId: string, portId: string) => void;
}

export type FlowNode = Node<FlowNodeData>;

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
    const compositionBodyWidth = Math.max(340, compositionWidth - compositionRailWidth * 2);
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
              zIndex: 2
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
        zIndex: 2
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

  const flowEdges: Edge[] = graph.edges.map((edge) => ({
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

  return { nodes: flowNodes, edges: flowEdges };
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
  return getPortRailWidth(requiredPorts) + DEFAULT_BODY_WIDTH + getPortRailWidth(providedPorts);
}

function getNodeRailWidth(ports: SwcGraphNode["ports"]) {
  return getPortRailWidth(ports);
}

function getPortRailWidth(ports: SwcGraphPort[]) {
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

function buildPortConnectionLabels(
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
        componentName: String(targetNode.metadata?.TYPE ?? targetNode.label),
        portName: targetPort.label,
        targetNodeId: targetNode.id,
        targetPortId: targetPort.id
      });

      const targetLabels = (labelsByNode[targetNode.id] ??= {});
      const targetConnections = (targetLabels[targetPort.id] ??= []);
      targetConnections.push({
        componentName: String(sourceNode.metadata?.TYPE ?? sourceNode.label),
        portName: sourcePort.label,
        targetNodeId: sourceNode.id,
        targetPortId: sourcePort.id
      });
    }
  }

  return labelsByNode;
}

export function getInspectableMetadata(node: SwcGraphNode | undefined, edge: SwcGraphEdge | undefined) {
  if (node) {
    return [
      ["Kind", node.kind],
      ["Semantic Path", node.semanticPath ?? "-"],
      ["XML Path", node.xmlPath ?? "-"],
      ["File", node.filePath],
      ["Ports", String(node.ports.length)],
      ...Object.entries(node.metadata ?? {})
    ];
  }

  if (edge) {
    return [
      ["Kind", edge.kind],
      ["Label", edge.label],
      ["File", edge.filePath],
      ["XML Path", edge.xmlPath ?? "-"],
      ["Warning", edge.warning ?? "-"]
    ];
  }

  return [];
}
