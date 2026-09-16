import { useEffect, useMemo, useRef, useState } from "react";
import "./EditorGraphZone.css";
import type { Node } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";
import type { AutosarEntity, SwcGraphScope } from "../../../../src/shared/contracts";
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
  layoutSwcGraph
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
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}

export function EditorGraphZone(props: EditorGraphZoneProps) {
  const {
    focusEntity,
    workspaceRevision,
    preferredScope,
    preferredNodeId,
    activeWorkspaceTab,
    onFocusModelEntity,
    onOpenWorkspaceTab
  } = props;
  const [graphScope, setGraphScope] = useState<SwcGraphScope>(() =>
    preferredScope ?? getDefaultGraphScope(focusEntity)
  );
  // Selection controls the details panel. The active composition node and port
  // additionally control graph isolation and connection-label navigation.
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeCompositionNodeId, setActiveCompositionNodeId] = useState<string | undefined>(preferredNodeId);
  const [activeCompositionPortId, setActiveCompositionPortId] = useState<string | undefined>(undefined);
  const flowCanvasRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<AutosarSwcController | null>(null);
  const isCompositionScope = graphScope === "composition";
  const tabRequestsInternals = activeWorkspaceTab?.includeCompositionInternals === true;
  const hasFocusedCompositionNode = Boolean(activeCompositionNodeId);
  // Composition internals are fetched only when the tab requests them or the
  // user has navigated into a specific composition instance.
  const includeCompositionInternals =
    isCompositionScope && (tabRequestsInternals || hasFocusedCompositionNode);
  let graphCacheKey: string | undefined;
  if (focusEntity) {
    const focusId = focusEntity.semanticPath ?? focusEntity.id;
    graphCacheKey = createGraphCacheKey(
      workspaceRevision,
      graphScope,
      focusId,
      includeCompositionInternals
    );
  }

  const isGraphSupportedForEntity = focusEntity?.type === "swc" || focusEntity?.type === "composition";
  const isEntityDetailsTab = activeWorkspaceTab?.kind === "entityDetails";
  const shouldLoadGraph = Boolean(focusEntity) && isGraphSupportedForEntity && !isEntityDetailsTab;
  const { graphResult, loading, error } = useAutosarSwcGraph({
    focusEntity,
    workspaceRevision,
    scope: graphScope,
    includeCompositionInternals,
    cacheKey: graphCacheKey,
    enabled: shouldLoadGraph
  });

  useEffect(() => {
    setGraphScope(preferredScope ?? getDefaultGraphScope(focusEntity));
  }, [focusEntity?.id, focusEntity?.type, preferredScope]);

  useEffect(() => {
    setActiveCompositionNodeId(preferredNodeId);
    setActiveCompositionPortId(undefined);
  }, [preferredNodeId, focusEntity?.id]);

  useEffect(() => {
    if (activeWorkspaceTab?.kind === "graph" && activeWorkspaceTab.preferredScope) {
      setGraphScope(activeWorkspaceTab.preferredScope);
      setActiveCompositionNodeId(activeWorkspaceTab.preferredNodeId);
    }
  }, [activeWorkspaceTab?.kind, activeWorkspaceTab?.preferredNodeId, activeWorkspaceTab?.preferredScope]);

  useEffect(() => {
    if (!graphResult) {
      return;
    }
    setSelectedNodeId(findInitialNodeId(graphResult, activeCompositionNodeId, preferredNodeId));
  }, [graphResult]);

  const graphNodes = graphResult?.nodes ?? [];
  const selectedGraphNode = graphNodes.find((node) => node.id === selectedNodeId);
  const inspector = selectedGraphNode?.inspector ?? findFallbackInspector(graphResult, focusEntity);
  let shouldIsolateCompositionNode = false;
  if (graphResult?.scope === "composition" && activeCompositionNodeId && preferredNodeId) {
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
      // An isolated instance shows its ports and connection labels without the
      // composition-level connector lines competing for the same space.
      visibleEdges = [];
    } else if (graphResult.scope === "composition") {
      visibleEdges = baseGraph.edges.filter((edge) => {
        const matchingGraphEdge = graphResult.edges.find((graphEdge) => graphEdge.id === edge.id);
        return matchingGraphEdge?.kind !== "assembly";
      });
    }

    const visibleNodes = baseGraph.nodes
      .filter((node) => !shouldIsolateCompositionNode || node.id === activeCompositionNodeId)
      .map((node) => {
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
  }, [activeCompositionNodeId, activeCompositionPortId, graphResult, preferredNodeId]);

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
  }, [activeCompositionNodeId, activeCompositionPortId, flowGraph.nodes, graphResult, shouldIsolateCompositionNode]);

  let flowCanvasKey = "empty";
  if (graphResult) {
    flowCanvasKey = `${graphResult.scope}:${graphResult.focusId}:${preferredNodeId ?? ""}`;
  }

  function handleNodeClick(_event: React.MouseEvent, node: Node) {
    const graphNode = graphNodes.find((entry) => entry.id === node.id);
    if (!graphNode) {
      return;
    }

    setSelectedNodeId(node.id);
  }

  function handleNodeDoubleClick(_event: React.MouseEvent, node: Node) {
    const graphNode = graphNodes.find((entry) => entry.id === node.id);
    if (!graphNode) {
      return;
    }

    if (graphNode.kind === "port") {
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

    onFocusModelEntity?.({
      entityId: targetEntityId,
      semanticPath: targetSemanticPath,
      preferredScope: targetScope,
      preferredNodeId: undefined,
      includeCompositionInternals: false
    });
  }

  let activeContent: ReactNode;
  if (!activeWorkspaceTab) {
    activeContent = <div className="empty-state">Select an SWC or composition from the AUTOSAR model.</div>;
  } else if (activeWorkspaceTab.kind === "graph") {
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
        tab={activeWorkspaceTab}
        focusEntity={focusEntity}
        graphResult={graphResult}
        inspector={inspector}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
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


