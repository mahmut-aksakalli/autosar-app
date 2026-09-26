import { useEffect, useMemo, useRef, useState } from "react";
import "./AutosarEditor.css";
import "../Common/Details/Details.css";
import type { Node } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";
import type {
  AutosarEntity,
  ConnectedPortReference,
  EntityReferenceInstance,
  AutosarLogEntry,
  SwcGraphPort,
  SwcGraphScope,
  SwcInstanceReference
} from "../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../EditorTabs/EditorTabs";
import type { BottomPanelTab } from "./AutosarSwc/BottomPanel/BottomPanel";
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
  getTallNodePortZoom,
  getIsolatedRailWidth,
  layoutVisibleSwcNode,
  type PortConnectionLabel,
  type SwcNodeView
} from "./AutosarSwc/AutosarSwcLayout";
import { getConnectionTreeNodeId, getDelegationNavigationTarget } from "./AutosarSwc/AutosarSwcNavigation";
import { SwcDetails } from "./SwcDetails/SwcDetails";
import { EntityDetails } from "./EntityDetails/EntityDetails";
import { PortInterfaceDetails } from "./PortInterfaceDetails/PortInterfaceDetails";

const GRAPH_FOCUS_RETRY_COUNT = 8;

// Only entity types with a project-wide usage index receive an Instances table.
// Addressing methods intentionally remain regular entity details without one.
const REFERENCE_INSTANCE_ENTITY_TYPES = new Set([
  "interface",
  "application-data-type",
  "implementation-data-type",
  "base-type",
  "unit",
  "compu-method",
  "data-constraint",
  "record-layout",
  "constant",
  "mode-declaration-group",
  "type-mapping-set"
]);

interface AutosarEditorProps {
  focusEntity?: AutosarEntity;
  modelEntities: AutosarEntity[];
  navigationEntities: AutosarEntity[];
  rootCompositionId?: string;
  workspaceRevision?: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  activeWorkspaceTab?: ModelWorkspaceTab;
  instances: SwcInstanceReference[];
  logEntries: AutosarLogEntry[];
  activeBottomPanelTab: BottomPanelTab;
  connectedPortsByPortId: Record<string, ConnectedPortReference[]>;
  referenceInstancesByTargetId: Record<string, EntityReferenceInstance[]>;
  onFocusModelEntity?: (selection: {
    entityId?: string;
    semanticPath?: string;
    preferredScope?: SwcGraphScope;
    preferredNodeId?: string;
    preferredPortId?: string;
    includeCompositionInternals?: boolean;
    compositionContextPaths?: string[];
    compositionTreeOrigin?: "template" | "root";
    treeNodeId?: string;
  }) => void;
  onRevealModelNode?: (entityId: string, treeNodeId?: string) => void;
  onCopyText?: (text: string) => void;
  onOpenSwcView?: (
    entityId: string | undefined,
    semanticPath: string | undefined,
    view: SwcNodeView,
    compositionContextPaths?: string[],
    compositionTreeOrigin?: "template" | "root"
  ) => void;
  onOpenPortInterface?: (interfaceRef: string) => void;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
  onOpenPortDetails?: (
    entityId: string | undefined,
    semanticPath: string | undefined,
    port: SwcGraphPort
  ) => void;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
  onConnectedPortSelect?: (connection: ConnectedPortReference) => void;
  onReferenceInstanceSelect?: (instance: EntityReferenceInstance) => void;
  onBottomPanelTabChange: (tab: BottomPanelTab) => void;
  onInstanceSelect: (instance: SwcInstanceReference) => void;
}

export function AutosarEditor(props: AutosarEditorProps) {
  const [graphScope, setGraphScope] = useState<SwcGraphScope>(() =>
    props.preferredScope ?? getDefaultGraphScope(props.focusEntity)
  );
  // Selection controls the details panel. The active composition node and port
  // additionally control graph isolation and connection-label navigation.
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeCompositionNodeId, setActiveCompositionNodeId] = useState<string | undefined>(props.preferredNodeId);
  const [activeCompositionPortId, setActiveCompositionPortId] = useState<string | undefined>(
    props.activeWorkspaceTab?.preferredPortId
  );
  const [selectedPort, setSelectedPort] = useState<{
    nodeId: string;
    portId: string;
  }>();
  const flowCanvasRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<AutosarSwcController | null>(null);
  const compositionContextKey = props.activeWorkspaceTab?.compositionContextPaths?.join("|");
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
      includeCompositionInternals,
      props.activeWorkspaceTab?.compositionContextPaths
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
    compositionContextPaths: props.activeWorkspaceTab?.compositionContextPaths,
    cacheKey: graphCacheKey,
    enabled: shouldLoadGraph
  });

  useEffect(() => {
    setGraphScope(props.preferredScope ?? getDefaultGraphScope(props.focusEntity));
  }, [props.focusEntity?.id, props.focusEntity?.type, props.preferredScope]);

  useEffect(() => {
    setActiveCompositionNodeId(props.preferredNodeId);
    setActiveCompositionPortId(props.activeWorkspaceTab?.preferredPortId);
    if (props.preferredNodeId && props.activeWorkspaceTab?.preferredPortId) {
      setSelectedPort({ nodeId: props.preferredNodeId, portId: props.activeWorkspaceTab.preferredPortId });
    } else {
      setSelectedPort(undefined);
    }
  }, [props.preferredNodeId, props.activeWorkspaceTab?.preferredPortId, props.focusEntity?.id, compositionContextKey]);

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
  const visibleGraphNode = graphNodes.find((node) => node.id === activeCompositionNodeId)
    ?? graphNodes.find((node) => node.kind === "composition" || node.kind === "swc")
    ?? graphNodes[0];
  const shouldIsolateCompositionNode = graphResult?.scope === "composition" &&
    Boolean(activeCompositionNodeId && visibleGraphNode?.id === activeCompositionNodeId);

  // Keep the full model graph for connection labels, but create only the one
  // React Flow node and its short port-summary edges for the current view.
  const flowGraph = useMemo(() => {
    if (!graphResult) {
      return { nodes: [], edges: [] };
    }

    const baseGraph = layoutVisibleSwcNode(graphResult, visibleGraphNode?.id);
    let portConnections: ReturnType<typeof buildPortConnectionLabels> = {};
    if (graphResult.scope === "composition") {
      portConnections = buildPortConnectionLabels(graphResult);
    }

    const visibleNodes = baseGraph.nodes
      .map((node) => {
        const sourceGraphNode = graphResult.nodes.find((entry) => entry.id === node.id);
        const isActiveCompositionNode = node.id === activeCompositionNodeId;
        const style = {
          ...(node.style ?? {}),
          ["--autosar-left-rail-width" as string]: `${getIsolatedRailWidth(node, portConnections[node.id], "left")}px`,
          ["--autosar-right-rail-width" as string]: `${getIsolatedRailWidth(node, portConnections[node.id], "right")}px`
        } as CSSProperties;

        let highlightedPortId: string | undefined;
        if (isActiveCompositionNode) {
          highlightedPortId = activeCompositionPortId;
        }

        return {
          ...node,
          style,
          data: {
            ...node.data,
            isRootCompositionInstance: sourceGraphNode?.kind === "composition" &&
              props.activeWorkspaceTab?.compositionTreeOrigin === "root" &&
              props.activeWorkspaceTab.compositionContextPaths?.length === 0,
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
              let compositionContextPaths = props.activeWorkspaceTab?.compositionContextPaths;
              let compositionTreeOrigin = props.activeWorkspaceTab?.compositionTreeOrigin;
              const opensCompositionInstance = sourceGraphNode?.kind === "instance" && props.modelEntities.some((entity) => {
                return entity.type === "composition" && entity.semanticPath === sourceGraphNode.typeRef;
              });
              if (opensCompositionInstance && sourceGraphNode?.semanticPath) {
                compositionContextPaths = compositionContextPaths
                  ? [...compositionContextPaths, sourceGraphNode.semanticPath]
                  : [sourceGraphNode.semanticPath];
                compositionTreeOrigin ??= "template";
              }
              props.onOpenSwcView?.(
                entityId,
                semanticPath,
                view,
                compositionContextPaths,
                compositionTreeOrigin
              );
            },
            onConnectionNavigate: (connection: PortConnectionLabel) => {
              if (connection.targetCompositionId) {
                const targetContextPaths = connection.targetCompositionContextPaths ?? [];
                props.onFocusModelEntity?.({
                  entityId: connection.targetCompositionId,
                  preferredScope: "composition",
                  preferredNodeId: connection.targetNodeId,
                  preferredPortId: connection.targetPortId,
                  compositionContextPaths: targetContextPaths,
                  compositionTreeOrigin: "root",
                  treeNodeId: connection.targetTreeNodeId ??
                    `${connection.targetCompositionId}:service:${connection.targetNodeId}`
                });
                return;
              }
              const delegationTarget = getDelegationNavigationTarget(
                props.focusEntity,
                props.navigationEntities,
                props.activeWorkspaceTab?.compositionContextPaths,
                connection,
                props.activeWorkspaceTab?.compositionTreeOrigin ?? "template",
                props.rootCompositionId
              );
              if (delegationTarget) {
                props.onFocusModelEntity?.(delegationTarget);
                return;
              }
              const nodeId = connection.targetNodeId;
              const portId = connection.targetPortId;
              setActiveCompositionNodeId(nodeId);
              setActiveCompositionPortId(portId);
              setSelectedNodeId(nodeId);
              // Connection-label navigation targets a concrete port. Keep the
              // PortSymbol selection in sync with the highlighted label.
              setSelectedPort({ nodeId, portId });
              const targetGraphNode = graphResult.nodes.find((entry) => entry.id === nodeId);
              const treeNodeId = getConnectionTreeNodeId(
                props.focusEntity,
                targetGraphNode,
                props.navigationEntities,
                props.activeWorkspaceTab?.compositionContextPaths,
                props.activeWorkspaceTab?.compositionTreeOrigin ?? "template"
              );
              if (props.focusEntity && treeNodeId) {
                props.onRevealModelNode?.(props.focusEntity.id, treeNodeId);
              }
            }
          }
        };
      });

    return {
      nodes: visibleNodes,
      edges: baseGraph.edges
    };
  }, [
    activeCompositionNodeId,
    activeCompositionPortId,
    graphResult,
    visibleGraphNode?.id,
    props.activeWorkspaceTab?.compositionContextPaths,
    props.activeWorkspaceTab?.compositionTreeOrigin,
    props.modelEntities,
    props.navigationEntities,
    props.rootCompositionId,
    props.onCopyText,
    props.onFocusModelEntity,
    props.onRevealModelNode,
    props.onOpenPortInterface,
    props.onOpenPortDetails,
    props.onOpenSwcView,
    props.preferredNodeId,
    selectedPort
  ]);

  let fitViewOptions = { padding: 0.2, maxZoom: 1.1, minZoom: 0.08 };
  if (shouldIsolateCompositionNode) {
    fitViewOptions = { padding: 0.12, maxZoom: 0.95, minZoom: 0.08 };
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

      if (activeCompositionPortId) {
        const canvasRect = flowCanvasRef.current?.getBoundingClientRect();
        const bottomPanelRect = flowCanvasRef.current
          ?.querySelector<HTMLElement>(".graph-bottom-panel-container")
          ?.getBoundingClientRect();
        let visibleCanvasHeight = canvasRect?.height ?? 0;
        if (canvasRect && bottomPanelRect) {
          visibleCanvasHeight = Math.max(0, Math.min(canvasRect.height, bottomPanelRect.top - canvasRect.top));
        }
        const portZoom = getTallNodePortZoom(
          targetHeight,
          visibleCanvasHeight
        );
        if (portZoom !== undefined) {
          const portHandle = Array.from(
            flowCanvasRef.current?.querySelectorAll<HTMLElement>("[data-autosar-port-id]") ?? []
          ).find((element) => element.dataset.autosarPortId === activeCompositionPortId);
          if (portHandle) {
            const portRect = portHandle.getBoundingClientRect();
            const portCenter = reactFlowRef.current.screenToFlowPosition({
              x: portRect.left + portRect.width / 2,
              y: portRect.top + portRect.height / 2
            });
            // React Flow centers within the whole canvas. Shift the target up
            // so an expanded bottom panel cannot cover the selected port.
            const panelOffset = ((canvasRect?.height ?? 0) - visibleCanvasHeight) / (2 * portZoom);
            void reactFlowRef.current.setCenter(portCenter.x, portCenter.y + panelOffset, {
              zoom: portZoom,
              duration: 220
            });
            return;
          }
          if (attempt < GRAPH_FOCUS_RETRY_COUNT) {
            attempt += 1;
            frameId = window.requestAnimationFrame(focusTargetNode);
            return;
          }
        }
      }

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
    flowCanvasKey = `${graphResult.scope}:${graphResult.focusId}:${props.preferredNodeId ?? ""}:${compositionContextKey ?? "template"}`;
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

    let compositionContextPaths = props.activeWorkspaceTab?.compositionContextPaths;
    let compositionTreeOrigin = props.activeWorkspaceTab?.compositionTreeOrigin;
    if (targetScope === "composition" && graphNode.kind === "instance" && graphNode.semanticPath) {
      compositionContextPaths = compositionContextPaths
        ? [...compositionContextPaths, graphNode.semanticPath]
        : [graphNode.semanticPath];
      compositionTreeOrigin ??= "template";
    }

    props.onFocusModelEntity?.({
      entityId: targetEntityId,
      semanticPath: targetSemanticPath,
      preferredScope: targetScope,
      preferredNodeId: undefined,
      includeCompositionInternals: false,
      compositionContextPaths,
      compositionTreeOrigin
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
        instances={props.instances}
        activeInstanceId={activeCompositionNodeId ?? props.preferredNodeId}
        logEntries={props.logEntries}
        activeBottomPanelTab={props.activeBottomPanelTab}
        fitViewOptions={fitViewOptions}
        onInit={(controller) => {
          reactFlowRef.current = controller;
        }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onBottomPanelTabChange={props.onBottomPanelTabChange}
        onInstanceSelect={props.onInstanceSelect}
      />
    );
  } else if (props.activeWorkspaceTab.kind === "entityDetails") {
    if (!props.focusEntity) {
      activeContent = <div className="empty-state">Select an AUTOSAR model entity.</div>;
    } else {
      let referenceInstances: EntityReferenceInstance[] | undefined;
      if (REFERENCE_INSTANCE_ENTITY_TYPES.has(props.focusEntity.type)) {
        referenceInstances = props.referenceInstancesByTargetId[props.focusEntity.id] ?? [];
      }

      if (props.focusEntity.type === "interface") {
        activeContent = (
          <PortInterfaceDetails
            title={props.activeWorkspaceTab.title}
            entity={props.focusEntity}
            referenceInstances={referenceInstances ?? []}
            selectedInstancePath={props.activeWorkspaceTab.itemId}
            onReferenceInstanceSelect={props.onReferenceInstanceSelect}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        );
      } else {
        activeContent = (
          <EntityDetails
            title={props.activeWorkspaceTab.title}
            entity={props.focusEntity}
            referenceInstances={referenceInstances}
            onReferenceInstanceSelect={props.onReferenceInstanceSelect}
          />
        );
      }
    }
  } else {
    activeContent = (
      <SwcDetails
        tab={props.activeWorkspaceTab}
        focusEntity={props.focusEntity}
        graphResult={graphResult}
        inspector={inspector}
        connectedPortsByPortId={props.connectedPortsByPortId}
        onConnectedPortSelect={props.onConnectedPortSelect}
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
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


