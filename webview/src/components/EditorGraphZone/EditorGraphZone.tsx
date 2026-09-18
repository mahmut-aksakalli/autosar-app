import { useEffect, useMemo, useRef, useState } from "react";
import "./EditorGraphZone.css";
import type { Node } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";
import type { AutosarEntity, SwcGraphPort, SwcGraphScope } from "../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../EditorTabs/EditorTabs";
import {
  createGraphCacheKey,
  findFallbackInspector,
  findInitialNodeId,
  useAutosarSwcGraph
} from "./AutosarSwc/AutosarSwcHelper";
import {
  AutosarSwc,
  type AutosarSwcController
} from "./AutosarSwc/AutosarSwc";
import {
  buildPortConnectionLabels,
  getEstimatedFlowNodeHeight,
  getEstimatedFlowNodeWidth,
  getFocusedNodeBounds,
  getFocusedNodeZoom,
  getIsolatedRailWidth,
  isPortConnectionListEdge,
  layoutSwcGraph,
  type SwcNodeView
} from "./AutosarSwc/AutosarSwcLayout";
import { SwcDetails } from "./SwcDetails/SwcDetails";

const GRAPH_FOCUS_RETRY_COUNT = 8;

interface EditorGraphZoneProps {
  focusEntity?: AutosarEntity;
  workspaceRevision?: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  activeWorkspaceTab?: ModelWorkspaceTab;
  onFocusModelEntity?: (selection: {
    entityId?: string;
    semanticPath?: string;
    preferredScope?: SwcGraphScope;
    preferredNodeId?: string;
    includeCompositionInternals?: boolean;
  }) => void;
  onCopyText?: (text: string) => void;
  onOpenSwcView?: (
    entityId: string | undefined,
    semanticPath: string | undefined,
    view: SwcNodeView
  ) => void;
  onOpenPortInterface?: (interfaceRef: string) => void;
  onOpenPortDetails?: (
    entityId: string | undefined,
    semanticPath: string | undefined,
    port: SwcGraphPort
  ) => void;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}

export function EditorGraphZone(props: EditorGraphZoneProps) {
  const [graphScope, setGraphScope] = useState<SwcGraphScope>(() =>
    props.preferredScope ?? getDefaultGraphScope(props.focusEntity)
  );
  // Selection controls the details panel. The active composition node and port
  // additionally control graph isolation and connection-label navigation.
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeCompositionNodeId, setActiveCompositionNodeId] = useState<string | undefined>(props.preferredNodeId);
  const [activeCompositionPortId, setActiveCompositionPortId] = useState<string | undefined>(undefined);
  const [selectedPort, setSelectedPort] = useState<{
    nodeId: string;
    portId: string;
  }>();
  const flowCanvasRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<AutosarSwcController | null>(null);
  const isCompositionScope = graphScope === "composition";
  const tabRequestsInternals = props.activeWorkspaceTab?.includeCompositionInternals === true;
  const hasFocusedCompositionNode = Boolean(activeCompositionNodeId);
  // Composition internals are fetched only when the tab requests them or the
  // user has navigated into a specific composition instance.
  const includeCompositionInternals =
    isCompositionScope && (tabRequestsInternals || hasFocusedCompositionNode);
  let graphCacheKey: string | undefined;
  if (props.focusEntity) {
    const focusId = props.focusEntity.semanticPath ?? props.focusEntity.id;
    graphCacheKey = createGraphCacheKey(
      props.workspaceRevision,
      graphScope,
      focusId,
      includeCompositionInternals
    );
  }

  const isGraphSupportedForEntity = props.focusEntity?.type === "swc" || props.focusEntity?.type === "composition";
  const isEntityDetailsTab = props.activeWorkspaceTab?.kind === "entityDetails";
  const shouldLoadGraph = Boolean(props.focusEntity) && isGraphSupportedForEntity && !isEntityDetailsTab;
  const { graphResult, loading, error } = useAutosarSwcGraph({
    focusEntity: props.focusEntity,
    workspaceRevision: props.workspaceRevision,
    scope: graphScope,
    includeCompositionInternals,
    cacheKey: graphCacheKey,
    enabled: shouldLoadGraph
  });

  useEffect(() => {
    setGraphScope(props.preferredScope ?? getDefaultGraphScope(props.focusEntity));
  }, [props.focusEntity?.id, props.focusEntity?.type, props.preferredScope]);

  useEffect(() => {
    setActiveCompositionNodeId(props.preferredNodeId);
    setActiveCompositionPortId(undefined);
    setSelectedPort(undefined);
  }, [props.preferredNodeId, props.focusEntity?.id]);

  useEffect(() => {
    if (props.activeWorkspaceTab?.kind === "graph" && props.activeWorkspaceTab.preferredScope) {
      setGraphScope(props.activeWorkspaceTab.preferredScope);
      setActiveCompositionNodeId(props.activeWorkspaceTab.preferredNodeId);
    }
  }, [props.activeWorkspaceTab?.kind, props.activeWorkspaceTab?.preferredNodeId, props.activeWorkspaceTab?.preferredScope]);

  useEffect(() => {
    if (!graphResult) {
      return;
    }
    setSelectedNodeId(findInitialNodeId(graphResult, activeCompositionNodeId, props.preferredNodeId));
  }, [graphResult]);

  const graphNodes = graphResult?.nodes ?? [];
  const selectedGraphNode = graphNodes.find((node) => node.id === selectedNodeId);
  const inspector = selectedGraphNode?.inspector ?? findFallbackInspector(graphResult, props.focusEntity);
  let shouldIsolateCompositionNode = false;
  if (graphResult?.scope === "composition" && activeCompositionNodeId && props.preferredNodeId) {
    shouldIsolateCompositionNode = graphResult.nodes.some((node) => {
      return node.id === activeCompositionNodeId && node.kind === "instance";
    });
  }

  // Start with the pure layout, then decorate it with view-only state such as
  // isolated nodes, highlighted ports, and connection navigation callbacks.
  const flowGraph = useMemo(() => {
    if (!graphResult) {
      return { nodes: [], edges: [] };
    }

    const baseGraph = layoutSwcGraph(graphResult);
    let portConnections: ReturnType<typeof buildPortConnectionLabels> = {};
    if (graphResult.scope === "composition") {
      portConnections = buildPortConnectionLabels(graphResult);
    }

    let visibleEdges = baseGraph.edges;
    if (shouldIsolateCompositionNode) {
      // Hide composition-level connectors while retaining the short native
      // edges between this SWC's port symbols and connection summaries.
      visibleEdges = baseGraph.edges.filter((edge) => {
        return edge.source === activeCompositionNodeId && isPortConnectionListEdge(edge);
      });
    } else if (graphResult.scope === "composition") {
      visibleEdges = baseGraph.edges.filter((edge) => {
        const matchingGraphEdge = graphResult.edges.find((graphEdge) => graphEdge.id === edge.id);
        return matchingGraphEdge?.kind !== "assembly";
      });
    }

    const visibleNodes = baseGraph.nodes
      .filter((node) => !shouldIsolateCompositionNode || node.id === activeCompositionNodeId)
      .map((node) => {
        const sourceGraphNode = graphResult.nodes.find((entry) => entry.id === node.id);
        const isActiveCompositionNode = node.id === activeCompositionNodeId;
        let style = node.style;
        if (shouldIsolateCompositionNode && isActiveCompositionNode) {
          style = {
            ...(node.style ?? {}),
            ["--autosar-left-rail-width" as string]: `${getIsolatedRailWidth(node, portConnections[node.id], "left")}px`,
            ["--autosar-right-rail-width" as string]: `${getIsolatedRailWidth(node, portConnections[node.id], "right")}px`
          } as CSSProperties;
        }

        let highlightedPortId: string | undefined;
        if (isActiveCompositionNode) {
          highlightedPortId = activeCompositionPortId;
        }

        return {
          ...node,
          style,
          data: {
            ...node.data,
            portConnections: portConnections[node.id] ?? {},
            highlightedPortId,
            selectedPortId: selectedPort?.nodeId === node.id ? selectedPort.portId : undefined,
            onPortSelect: (portId: string) => {
              setSelectedNodeId(node.id);
              setSelectedPort({ nodeId: node.id, portId });
            },
            onPortInterfaceOpen: props.onOpenPortInterface,
            onCopyText: props.onCopyText,
            onPortDetailsOpen: (port: SwcGraphPort) => {
              let entityId: string | undefined = node.id;
              let semanticPath = sourceGraphNode?.semanticPath;
              if (node.data.kind === "instance") {
                entityId = undefined;
                semanticPath = sourceGraphNode?.typeRef;
              }
              props.onOpenPortDetails?.(entityId, semanticPath, port);
            },
            onCopyName: () => props.onCopyText?.(node.data.label),
            onOpenView: (view: SwcNodeView) => {
              let entityId: string | undefined = node.id;
              let semanticPath = sourceGraphNode?.semanticPath;
              if (node.data.kind === "instance") {
                entityId = undefined;
                semanticPath = sourceGraphNode?.typeRef;
              }
              props.onOpenSwcView?.(entityId, semanticPath, view);
            },
            onConnectionNavigate: (nodeId: string, portId: string) => {
              setActiveCompositionNodeId(nodeId);
              setActiveCompositionPortId(portId);
              setSelectedNodeId(nodeId);
            }
          }
        };
      });

    return {
      nodes: visibleNodes,
      edges: visibleEdges
    };
  }, [
    activeCompositionNodeId,
    activeCompositionPortId,
    graphResult,
    props.onCopyText,
    props.onOpenPortInterface,
    props.onOpenPortDetails,
    props.onOpenSwcView,
    props.preferredNodeId,
    selectedPort
  ]);

  let fitViewOptions = { padding: 0.2, maxZoom: 1.1, minZoom: 0.35 };
  if (shouldIsolateCompositionNode) {
    fitViewOptions = { padding: 0.12, maxZoom: 0.95, minZoom: 0.35 };
  }

  // Centering must run after React Flow measures its custom nodes. Estimated
  // dimensions keep navigation functional if measurement is delayed.
  useEffect(() => {
    if (!reactFlowRef.current) {
      return;
    }
    if (!graphResult || graphResult.scope !== "composition") {
      return;
    }
    if (!activeCompositionNodeId) {
      return;
    }

    const targetFlowNode = flowGraph.nodes.find((node) => node.id === activeCompositionNodeId);
    if (!targetFlowNode) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let attempt = 0;

    const focusTargetNode = () => {
      if (cancelled || !reactFlowRef.current) {
        return;
      }

      const measuredNode = reactFlowRef.current.getNode(activeCompositionNodeId);
      const measuredPosition = measuredNode?.positionAbsolute;
      const fallbackPosition = targetFlowNode.position;
      const targetPosition = measuredPosition ?? fallbackPosition;
      const targetWidth = measuredNode?.width ?? getEstimatedFlowNodeWidth(targetFlowNode);
      const targetHeight = measuredNode?.height ?? getEstimatedFlowNodeHeight(targetFlowNode);

      if (!measuredPosition && attempt < GRAPH_FOCUS_RETRY_COUNT) {
        // React Flow measures custom nodes asynchronously. Retry for a few
        // animation frames before falling back to the layout estimate.
        attempt += 1;
        frameId = window.requestAnimationFrame(focusTargetNode);
        return;
      }

      const focusBounds = getFocusedNodeBounds(
        targetFlowNode,
        targetPosition,
        targetWidth,
        targetHeight,
        activeCompositionPortId
      );
      const zoom = getFocusedNodeZoom(
        focusBounds,
        flowCanvasRef.current?.getBoundingClientRect(),
        shouldIsolateCompositionNode
      );

      void reactFlowRef.current.setCenter(focusBounds.x + focusBounds.width / 2, focusBounds.y + focusBounds.height / 2, {
        zoom,
        duration: 220
      });
    };

    frameId = window.requestAnimationFrame(focusTargetNode);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [activeCompositionNodeId, activeCompositionPortId, graphResult, shouldIsolateCompositionNode]);

  let flowCanvasKey = "empty";
  if (graphResult) {
    flowCanvasKey = `${graphResult.scope}:${graphResult.focusId}:${props.preferredNodeId ?? ""}`;
  }

  function handleNodeClick(_event: React.MouseEvent, node: Node) {
    const graphNode = graphNodes.find((entry) => entry.id === node.id);
    if (!graphNode) {
      return;
    }

    setSelectedNodeId(node.id);
    setSelectedPort(undefined);
  }

  function handleNodeDoubleClick(_event: React.MouseEvent, node: Node) {
    const graphNode = graphNodes.find((entry) => entry.id === node.id);
    if (!graphNode) {
      return;
    }

    let targetSemanticPath = graphNode.semanticPath;
    let targetEntityId: string | undefined = graphNode.id;
    if (graphNode.kind === "instance") {
      // Instances are graph-only objects. Navigation must target the SWC type
      // referenced by the instance rather than the instance node itself.
      targetSemanticPath = graphNode.typeRef;
      targetEntityId = undefined;
    }
    if (!targetSemanticPath) {
      return;
    }

    let targetScope: SwcGraphScope = "swc";
    if (graphNode.swcKind === "composition" || graphNode.kind === "composition") {
      targetScope = "composition";
    }

    props.onFocusModelEntity?.({
      entityId: targetEntityId,
      semanticPath: targetSemanticPath,
      preferredScope: targetScope,
      preferredNodeId: undefined,
      includeCompositionInternals: false
    });
  }

  let activeContent: ReactNode;
  if (!props.activeWorkspaceTab) {
    activeContent = <div className="empty-state">Select an SWC or composition from the AUTOSAR model.</div>;
  } else if (props.activeWorkspaceTab.kind === "graph") {
    activeContent = (
      <AutosarSwc
        canvasRef={flowCanvasRef}
        canvasKey={flowCanvasKey}
        nodes={flowGraph.nodes}
        edges={flowGraph.edges}
        graphResult={graphResult}
        loading={loading}
        error={error}
        warnings={graphResult?.warnings ?? []}
        fitViewOptions={fitViewOptions}
        onInit={(controller) => {
          reactFlowRef.current = controller;
        }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
      />
    );
  } else {
    activeContent = (
      <SwcDetails
        tab={props.activeWorkspaceTab}
        focusEntity={props.focusEntity}
        graphResult={graphResult}
        inspector={inspector}
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  return (
    <div className="model-workbench">
      <div className="model-content">{activeContent}</div>
    </div>
  );
}

function getDefaultGraphScope(entity: AutosarEntity | undefined): SwcGraphScope {
  if (entity?.type === "composition") {
    return "composition";
  }
  return "swc";
}


