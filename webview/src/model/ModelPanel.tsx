import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node
} from "@xyflow/react";
import type { CSSProperties } from "react";
import type { AutosarEntity, SwcGraphScope } from "../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../tabs/modelWorkspaceTab";
import { useGraphQuery } from "../graph/useGraphQuery";
import {
  AutosarFlowNode,
  buildPortConnectionLabels,
  getEstimatedFlowNodeHeight,
  getEstimatedFlowNodeWidth,
  getFocusedNodeBounds,
  getFocusedNodeZoom,
  getIsolatedRailWidth,
  makeGraphCacheKey,
  noopEdgesChange,
  noopNodesChange,
  resolveFallbackInspector,
  resolveInitialSelection
} from "../graph/GraphPresentation";
import { ModelSemanticTab } from "../inspector/ModelSemanticTab";
import { layoutSwcGraph } from "./graphLayout";

const GRAPH_FOCUS_RETRY_COUNT = 8;

interface ModelPanelProps {
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

export function ModelPanel(props: ModelPanelProps) {
  const {
    focusEntity,
    workspaceRevision,
    preferredScope,
    preferredNodeId,
    activeWorkspaceTab,
    onFocusModelEntity,
    onOpenWorkspaceTab
  } = props;
  const [graphScope, setGraphScope] = useState<SwcGraphScope>(
    preferredScope ?? (focusEntity?.type === "composition" ? "composition" : "swc")
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeCompositionNodeId, setActiveCompositionNodeId] = useState<string | undefined>(preferredNodeId);
  const [activeCompositionPortId, setActiveCompositionPortId] = useState<string | undefined>(undefined);
  const flowCanvasRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<{
    getNode: (id: string) => {
      positionAbsolute?: { x: number; y: number };
      width?: number;
      height?: number;
    } | undefined;
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => unknown;
  } | null>(null);
  const includeCompositionInternals =
    graphScope === "composition" &&
    (activeWorkspaceTab?.includeCompositionInternals === true || Boolean(activeCompositionNodeId));
  const graphCacheKey = focusEntity
    ? makeGraphCacheKey(
        workspaceRevision,
        graphScope,
        focusEntity.semanticPath ?? focusEntity.id,
        includeCompositionInternals
      )
    : undefined;
  const { graphResult, loading, error } = useGraphQuery({
    focusEntity,
    workspaceRevision,
    scope: graphScope,
    includeCompositionInternals,
    cacheKey: graphCacheKey,
    enabled:
      Boolean(focusEntity) &&
      activeWorkspaceTab?.kind !== "entityDetails" &&
      (focusEntity?.type === "swc" || focusEntity?.type === "composition")
  });

  useEffect(() => {
    setGraphScope(preferredScope ?? (focusEntity?.type === "composition" ? "composition" : "swc"));
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
    setSelectedNodeId(resolveInitialSelection(graphResult, activeCompositionNodeId, preferredNodeId));
  }, [graphResult]);

  const graphNodes = graphResult?.nodes ?? [];
  const selectedGraphNode = graphNodes.find((node) => node.id === selectedNodeId);
  const inspector = selectedGraphNode?.inspector ?? resolveFallbackInspector(graphResult, focusEntity);
  const shouldIsolateCompositionNode =
    graphResult?.scope === "composition" &&
    Boolean(activeCompositionNodeId) &&
    Boolean(preferredNodeId) &&
    graphResult.nodes.some((node) => node.id === activeCompositionNodeId && node.kind === "instance");

  const flowGraph = useMemo(() => {
    if (!graphResult) {
      return { nodes: [], edges: [] };
    }

    const baseGraph = layoutSwcGraph(graphResult);
    const portConnections =
      graphResult.scope === "composition"
        ? buildPortConnectionLabels(graphResult)
        : {};
    const visibleEdges =
      shouldIsolateCompositionNode
        ? []
        : graphResult.scope === "composition"
        ? baseGraph.edges.filter(
            (edge) =>
              !graphResult.edges.find((graphEdge) => graphEdge.id === edge.id && graphEdge.kind === "assembly")
          )
        : baseGraph.edges;
    const visibleNodes = baseGraph.nodes
      .filter((node) => !shouldIsolateCompositionNode || node.id === activeCompositionNodeId)
      .map((node) => ({
        ...node,
        style:
          shouldIsolateCompositionNode && node.id === activeCompositionNodeId
            ? ({
                ...(node.style ?? {}),
                ["--autosar-left-rail-width" as string]: `${getIsolatedRailWidth(node, portConnections[node.id], "left")}px`,
                ["--autosar-right-rail-width" as string]: `${getIsolatedRailWidth(node, portConnections[node.id], "right")}px`
              } as CSSProperties)
            : node.style,
        data: {
          ...node.data,
          portConnections: portConnections[node.id] ?? {},
          highlightedPortId: node.id === activeCompositionNodeId ? activeCompositionPortId : undefined,
          onConnectionNavigate: (nodeId: string, portId: string) => {
            setActiveCompositionNodeId(nodeId);
            setActiveCompositionPortId(portId);
            setSelectedNodeId(nodeId);
          }
        }
      }));

    return {
      nodes: visibleNodes,
      edges: visibleEdges
    };
  }, [activeCompositionNodeId, activeCompositionPortId, graphResult, preferredNodeId]);

  const fitViewOptions = shouldIsolateCompositionNode
    ? { padding: 0.12, maxZoom: 0.95, minZoom: 0.35 }
    : { padding: 0.2, maxZoom: 1.1, minZoom: 0.35 };

  useEffect(() => {
    if (!reactFlowRef.current || !graphResult || graphResult.scope !== "composition" || !activeCompositionNodeId) {
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

  const nodeTypes = useMemo(
    () => ({
      autosarNode: AutosarFlowNode
    }),
    []
  );
  const flowCanvasKey = graphResult ? `${graphResult.scope}:${graphResult.focusId}:${preferredNodeId ?? ""}` : "empty";

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

    const targetSemanticPath = graphNode.kind === "instance" ? graphNode.typeRef : graphNode.semanticPath;
    if (!targetSemanticPath) {
      return;
    }

    onFocusModelEntity?.({
      entityId: graphNode.kind === "instance" ? undefined : graphNode.id,
      semanticPath: targetSemanticPath,
      preferredScope: graphNode.swcKind === "composition" || graphNode.kind === "composition" ? "composition" : "swc",
      preferredNodeId: undefined,
      includeCompositionInternals: false
    });
  }

  const warnings = graphResult?.warnings ?? [];

  return (
    <div className="model-workbench">
      <div className="model-content">
        {!activeWorkspaceTab ? (
          <div className="empty-state">Select an SWC or composition from the AUTOSAR model.</div>
        ) : activeWorkspaceTab.kind === "graph" ? (
          <div className="model-canvas-shell" ref={flowCanvasRef}>
          {warnings.length > 0 && (
            <div className="model-warning-strip">
              {warnings.map((warning) => warning.message).join(" ")}
            </div>
          )}
          {error ? (
            <div className="empty-state">Could not build the model graph: {error}</div>
          ) : loading ? (
            <div className="empty-state">Building AUTOSAR graph…</div>
          ) : graphResult && graphResult.nodes.length > 0 ? (
            <ReactFlowProvider>
              <ReactFlow
                key={flowCanvasKey}
                nodes={flowGraph.nodes}
                edges={flowGraph.edges}
                nodeTypes={nodeTypes}
                onInit={(instance) => {
                  reactFlowRef.current = {
                    getNode: (id) => instance.getNode(id) as {
                      positionAbsolute?: { x: number; y: number };
                      width?: number;
                      height?: number;
                    } | undefined,
                    setCenter: (x, y, options) => instance.setCenter(x, y, options)
                  };
                }}
                fitView
                fitViewOptions={fitViewOptions}
                minZoom={0.35}
                maxZoom={1.5}
                zoomOnDoubleClick={false}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                onNodesChange={noopNodesChange}
                onEdgesChange={noopEdgesChange}
              >
                <Background color="#d7e2ef" gap={20} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
          ) : (
            <div className="empty-state">Select an SWC or composition to visualize it.</div>
          )}
          </div>
        ) : (
          <ModelSemanticTab
            tab={activeWorkspaceTab}
            focusEntity={focusEntity}
            graphResult={graphResult}
            inspector={inspector}
            onOpenWorkspaceTab={onOpenWorkspaceTab}
          />
        )}
      </div>
    </div>
  );
}


