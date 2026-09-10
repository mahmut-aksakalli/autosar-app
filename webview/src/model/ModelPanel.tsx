import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange
} from "@xyflow/react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type {
  AutosarEntity,
  PortInterfaceKind,
  SwcGraphNode,
  SwcGraphPort,
  SwcGraphResult,
  SwcGraphScope,
  SwcInspectorData,
  SwcInspectorItem,
  SwcInspectorSectionId,
  ValidationIssue
} from "../shared/contracts";
import { layoutSwcGraph, type FlowNode, type FlowNodeData } from "./graphLayout";

const PORT_WIDTH = 170;
const CONNECTION_LABEL_ANCHOR_OFFSET = 220;
const CONNECTION_LABEL_STEM_WIDTH = 100;
const CONNECTION_LABEL_GAP = 6;
const CONNECTION_PILL_PADDING = 24;
const CONNECTION_CHAR_WIDTH = 7.2;
const GRAPH_FOCUS_RETRY_COUNT = 8;
const GRAPH_FALLBACK_BODY_WIDTH = 430;
const GRAPH_FALLBACK_BASE_HEIGHT = 280;
const GRAPH_FALLBACK_PORT_MARGIN = 96;
const GRAPH_FALLBACK_PORT_SPACING = 52;

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

export interface ModelWorkspaceTab {
  id: string;
  title: string;
  pinned?: boolean;
  kind:
    | "graph"
    | "ports"
    | "runnables"
    | "events"
    | "behavior"
    | "memory"
    | "parameters"
    | "interRunnableVariables"
    | "perInstanceMemory"
    | "exclusiveAreas"
    | "serviceDependencies"
    | "serviceDependencyGroup"
    | "port"
    | "parameter"
    | "interRunnableVariable"
    | "perInstanceMemoryItem"
    | "serviceDependency"
    | "runnable"
    | "event"
    | "entityDetails";
  focusEntityId: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  includeCompositionInternals?: boolean;
  entityId?: string;
  sectionId?: SwcInspectorSectionId;
  itemId?: string;
  serviceType?: string;
  xmlPath?: string;
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
  const graphCacheRef = useRef(new Map<string, SwcGraphResult>());
  const [, setGraphCacheVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
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
  const graphResult = graphCacheKey ? graphCacheRef.current.get(graphCacheKey) : undefined;

  useEffect(() => {
    graphCacheRef.current.clear();
    setGraphCacheVersion((version) => version + 1);
  }, [workspaceRevision]);

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
    if (!focusEntity) {
      setLoading(false);
      return;
    }

    if (
      activeWorkspaceTab?.kind === "entityDetails" ||
      (focusEntity.type !== "swc" && focusEntity.type !== "composition")
    ) {
      setLoading(false);
      setError(undefined);
      return;
    }

    if (graphCacheKey) {
      const cachedGraph = graphCacheRef.current.get(graphCacheKey);
      if (cachedGraph) {
        setLoading(false);
        setError(undefined);
        setSelectedNodeId(resolveInitialSelection(cachedGraph, activeCompositionNodeId, preferredNodeId));
        setSelectedEdgeId(undefined);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void window.autosarApi
      .buildGraph({
        scope: graphScope,
        focusId: focusEntity.semanticPath ?? focusEntity.id,
        depth: 1,
        includeCompositionInternals
      })
      .then((graph) => {
        if (cancelled) {
          return;
        }
        if (graphCacheKey) {
          graphCacheRef.current.set(graphCacheKey, graph);
          setGraphCacheVersion((version) => version + 1);
        }
        setLoading(false);
        setSelectedNodeId(resolveInitialSelection(graph, activeCompositionNodeId, preferredNodeId));
        setSelectedEdgeId(undefined);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCompositionNodeId,
    activeWorkspaceTab?.kind,
    focusEntity,
    graphCacheKey,
    graphScope,
    includeCompositionInternals,
    preferredNodeId,
    workspaceRevision
  ]);

  const graphNodes = graphResult?.nodes ?? [];
  const graphEdges = graphResult?.edges ?? [];
  const selectedGraphNode = graphNodes.find((node) => node.id === selectedNodeId);
  const selectedGraphEdge = graphEdges.find((edge) => edge.id === selectedEdgeId);
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
            setSelectedEdgeId(undefined);
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
    setSelectedEdgeId(undefined);
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
                onEdgeClick={(_event, edge) => {
                  setSelectedEdgeId(edge.id);
                  setSelectedNodeId(undefined);
                }}
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
            selectedNode={selectedGraphNode}
            selectedEdge={selectedGraphEdge}
            onOpenWorkspaceTab={onOpenWorkspaceTab}
          />
        )}
      </div>
    </div>
  );
}

function ModelSemanticTab(props: {
  tab: ModelWorkspaceTab;
  focusEntity?: AutosarEntity;
  graphResult?: SwcGraphResult;
  inspector?: SwcInspectorData;
  selectedNode?: SwcGraphNode;
  selectedEdge?: SwcGraphResult["edges"][number];
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const {
    tab,
    focusEntity,
    graphResult,
    inspector,
    selectedNode,
    selectedEdge,
    onOpenWorkspaceTab
  } = props;
  const semanticInspector = inspector ?? focusEntity?.inspector;
  const ports = graphResult?.nodes.find((node) => node.id === focusEntity?.id)?.ports ?? graphResult?.nodes[0]?.ports ?? [];

  if (!focusEntity) {
    return <div className="empty-state">Select an AUTOSAR model entity.</div>;
  }

  if (tab.kind === "entityDetails") {
    return <ModelEntityDetailsSurface title={tab.title} entity={focusEntity} />;
  }

  if (tab.kind === "runnables") {
    const runnables = semanticInspector?.sections.find((section) => section.id === "runnables")?.items ?? [];
    return (
      <ModelRunnablesTableSurface
        title={tab.title}
        swcName={focusEntity.shortName}
        runnables={runnables}
        focusEntityId={focusEntity.id}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "ports") {
    return (
      <ModelPortsTableSurface
        title={tab.title}
        ports={ports}
        focusEntityId={focusEntity.id}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "parameters") {
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={collectInspectorItems(semanticInspector, ["calibrationVariables", "interfaceParameters"])}
        focusEntityId={focusEntity.id}
        detailKind="parameter"
        detailTitlePrefix="Parameter"
        emptyLabel="No parameters discovered."
        filterPlaceholder="Filter parameters"
        columns={[
          { key: "label", label: "Parameter Name" },
          { key: "TYPE", label: "Type" },
          { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
          { key: "SCOPE", label: "Scope" },
          { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "interRunnableVariables") {
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={collectInspectorItems(semanticInspector, ["interRunnableVariables"])}
        focusEntityId={focusEntity.id}
        detailKind="interRunnableVariable"
        detailTitlePrefix="Inter-Runnable Variable"
        emptyLabel="No inter-runnable variables discovered."
        filterPlaceholder="Filter inter-runnable variables"
        columns={[
          { key: "label", label: "Name" },
          { key: "TYPE", label: "Data Type" },
          { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
          { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "perInstanceMemory") {
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={collectInspectorItems(semanticInspector, ["perInstanceMemory"])}
        focusEntityId={focusEntity.id}
        detailKind="perInstanceMemoryItem"
        detailTitlePrefix="Per-Instance Memory"
        emptyLabel="No per-instance memory discovered."
        filterPlaceholder="Filter per-instance memory"
        columns={[
          { key: "label", label: "Name" },
          { key: "TYPE", label: "Data Type" },
          { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
          { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "serviceDependencies" || tab.kind === "serviceDependencyGroup") {
    const serviceItems = collectInspectorItems(semanticInspector, ["serviceDependencies"]).filter(
      (entry) => !tab.serviceType || entry.item.metadata?.["SERVICE-TYPE"] === tab.serviceType
    );
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={serviceItems}
        focusEntityId={focusEntity.id}
        detailKind="serviceDependency"
        detailTitlePrefix="Service Need"
        emptyLabel="No service needs discovered."
        filterPlaceholder="Filter service needs"
        columns={[
          { key: "label", label: "Name" },
          { key: "SERVICE-TYPE", label: "Service Type" },
          { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "port") {
    const port =
      ports.find((entry) => entry.id === tab.entityId || entry.xmlPath === tab.xmlPath) ??
      graphResult?.nodes.flatMap((node) => node.ports).find((entry) => entry.id === tab.entityId);
    return (
      <ModelPortSurface
        title={tab.title}
        port={port}
        filePath={port?.filePath ?? focusEntity.filePath}
        xmlPath={port?.xmlPath ?? tab.xmlPath}
      />
    );
  }

  if (tab.kind === "parameter") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["calibrationVariables", "interfaceParameters"], tab.itemId);
    return <ModelParameterSurface title={tab.title} parameter={item} />;
  }

  if (tab.kind === "interRunnableVariable") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["interRunnableVariables"], tab.itemId);
    return <ModelInterRunnableVariableSurface title={tab.title} variable={item} />;
  }

  if (tab.kind === "perInstanceMemoryItem") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["perInstanceMemory"], tab.itemId);
    return <ModelPerInstanceMemorySurface title={tab.title} item={item} />;
  }

  if (tab.kind === "serviceDependency") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["serviceDependencies"], tab.itemId);
    return <ModelServiceDependencySurface title={tab.title} item={item} />;
  }

  if (tab.kind === "runnable") {
    const runnable = findInspectorItem(semanticInspector, "runnables", tab.itemId);
    return (
      <ModelRunnableSurface
        title={tab.title}
        runnable={runnable}
        filePath={focusEntity.filePath}
        xmlPath={runnable?.xmlPath ?? tab.xmlPath}
      />
    );
  }

  if (tab.kind === "behavior") {
    return (
      <ModelTableSurface
        title={tab.title}
        emptyLabel="No behavior details discovered."
        columns={[
          { key: "section", label: "Section" },
          { key: "count", label: "Items" }
        ]}
        rows={(semanticInspector?.sections ?? []).map((section) => ({
          id: section.id,
          section: section.label,
          count: String(section.items.length)
        }))}
      />
    );
  }

  const sectionIds = getSectionsForTab(tab.kind);
  const rows = sectionIds.flatMap((sectionId) => {
    const section = semanticInspector?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({
      id: `${sectionId}:${item.id}`,
      label: item.label,
      section: section?.label ?? sectionId,
      ...item.metadata,
      filePath: focusEntity.filePath,
      xmlPath: item.xmlPath
    }));
  });

  return (
    <ModelTableSurface
      title={tab.title}
      emptyLabel={getEmptyLabel(tab.kind)}
      columns={getSemanticColumns(tab.kind)}
      rows={rows}
    />
  );
}

function ModelRunnablesTableSurface(props: {
  title: string;
  swcName: string;
  runnables: SwcInspectorItem[];
  focusEntityId: string;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const { title, swcName, runnables, focusEntityId, onOpenWorkspaceTab } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: RunnableTableColumnKey; direction: SortDirection }>({
    key: "runnableName",
    direction: "asc"
  });
  const rows = useMemo(
    () =>
      runnables.map((runnable) => ({
        runnable,
        swcName,
        runnableName: runnable.label,
        runnableSymbol: runnable.metadata?.SYMBOL ?? "-",
        period: formatOptionalMilliseconds(runnable.metadata?.PERIOD),
        periodSortValue: Number(runnable.metadata?.PERIOD)
      })),
    [runnables, swcName]
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.swcName, row.runnableName, row.runnableSymbol, row.period].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => compareRunnableRows(left, right, sort));
  }, [rows, searchQuery, sort]);

  const changeSort = (key: RunnableTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
        <label className="model-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter runnables"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {runnables.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                <SortableTableHeader
                  label="SWC name"
                  columnKey="swcName"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortableTableHeader
                  label="Runnable Name"
                  columnKey="runnableName"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortableTableHeader
                  label="Runnable Symbol"
                  columnKey="runnableSymbol"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortableTableHeader
                  label="Period"
                  columnKey="period"
                  sort={sort}
                  onSort={changeSort}
                />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.runnable.id}
                  tabIndex={0}
                  role="button"
                  onClick={() =>
                    onOpenWorkspaceTab?.({
                      id: `${focusEntityId}:runnable:${row.runnable.id}`,
                      title: `Runnable: ${row.runnable.label}`,
                      kind: "runnable",
                      focusEntityId,
                      sectionId: "runnables",
                      itemId: row.runnable.id,
                      xmlPath: row.runnable.xmlPath
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenWorkspaceTab?.({
                        id: `${focusEntityId}:runnable:${row.runnable.id}`,
                        title: `Runnable: ${row.runnable.label}`,
                        kind: "runnable",
                        focusEntityId,
                        sectionId: "runnables",
                        itemId: row.runnable.id,
                        xmlPath: row.runnable.xmlPath
                      });
                    }
                  }}
                >
                  <td>{row.swcName}</td>
                  <td>{row.runnableName}</td>
                  <td>{row.runnableSymbol}</td>
                  <td>{row.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching runnables.</div>}
        </div>
      ) : (
        <div className="empty-state">No runnables discovered.</div>
      )}
    </div>
  );
}

function ModelPortsTableSurface(props: {
  title: string;
  ports: SwcGraphPort[];
  focusEntityId: string;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const { title, ports, focusEntityId, onOpenWorkspaceTab } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: PortTableColumnKey; direction: SortDirection }>({
    key: "portName",
    direction: "asc"
  });
  const rows = useMemo(
    () =>
      ports.map((port) => ({
        port,
        portName: port.label,
        direction: formatPortDirectionLabel(port.direction, port.interfaceKind),
        isServicePort: formatBooleanMetadata(port.metadata?.["IS-SERVICE"]),
        interfaceName: formatReferenceShortName(port.interfaceRef),
        interfaceRef: port.interfaceRef ?? "-"
      })),
    [ports]
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.portName, row.direction, row.isServicePort, row.interfaceName, row.interfaceRef].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => comparePortRows(left, right, sort));
  }, [rows, searchQuery, sort]);

  const changeSort = (key: PortTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const openPortTab = (port: SwcGraphPort) => {
    onOpenWorkspaceTab?.({
      id: `${focusEntityId}:port:${port.id}`,
      title: `Port: ${port.label}`,
      kind: "port",
      focusEntityId,
      entityId: port.id,
      xmlPath: port.xmlPath
    });
  };

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
        <label className="model-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter ports"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {ports.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                <SortableTableHeader label="Port" columnKey="portName" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Direction" columnKey="direction" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Is Service Port" columnKey="isServicePort" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Interface" columnKey="interfaceName" sort={sort} onSort={changeSort} />
                <SortableTableHeader label="Interface Ref" columnKey="interfaceRef" sort={sort} onSort={changeSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.port.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openPortTab(row.port)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPortTab(row.port);
                    }
                  }}
                >
                  <td>{row.portName}</td>
                  <td>{row.direction}</td>
                  <td>{row.isServicePort}</td>
                  <td title={row.interfaceRef}>{row.interfaceName}</td>
                  <td title={row.interfaceRef}>{row.interfaceRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching ports.</div>}
        </div>
      ) : (
        <div className="empty-state">No ports discovered.</div>
      )}
    </div>
  );
}

function ModelInspectorItemsTableSurface(props: {
  title: string;
  items: InspectorTableItem[];
  focusEntityId: string;
  detailKind: "parameter" | "interRunnableVariable" | "perInstanceMemoryItem" | "serviceDependency";
  detailTitlePrefix: string;
  emptyLabel: string;
  filterPlaceholder: string;
  columns: Array<{ key: string; label: string }>;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const {
    title,
    items,
    focusEntityId,
    detailKind,
    detailTitlePrefix,
    emptyLabel,
    filterPlaceholder,
    columns,
    onOpenWorkspaceTab
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({
    key: columns[0]?.key ?? "label",
    direction: "asc"
  });
  const rows = useMemo(
    () =>
      items.map((entry) => {
        const metadata = entry.item.metadata ?? {};
        return {
          id: `${entry.sectionId}:${entry.item.id}`,
          item: entry.item,
          sectionId: entry.sectionId,
          section: entry.sectionLabel,
          label: entry.item.label,
          filePath: entry.filePath,
          xmlPath: entry.item.xmlPath,
          ...metadata,
          TYPE: formatReferenceShortName(metadata.TYPE),
          "ASSIGNED-PORT-PROTOTYPE": formatAssignedPortPrototypeColumn(
            metadata["ASSIGNED-PORT-DETAILS"],
            metadata["ASSIGNED-PORTS"]
          ),
          "INITIAL-VALUE-TYPE": formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-"),
          SCOPE: metadata.SCOPE ?? "-",
          "SW-CALIBRATION-ACCESS": formatCalibrationAccess(metadata["SW-CALIBRATION-ACCESS"])
        };
      }),
    [items]
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? columns.some((column) => normalizeTableSearch(String(row[column.key] ?? "")).includes(normalizedQuery))
          : true
      )
      .sort((left, right) => {
        const direction = sort.direction === "asc" ? 1 : -1;
        return direction * compareTableText(String(left[sort.key] ?? ""), String(right[sort.key] ?? ""));
      });
  }, [columns, rows, searchQuery, sort]);

  const changeSort = (key: string) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const openItemTab = (row: InspectorTableRow) => {
    onOpenWorkspaceTab?.({
      id: `${focusEntityId}:${detailKind}:${row.sectionId}:${row.item.id}`,
      title: `${detailTitlePrefix}: ${row.item.label}`,
      kind: detailKind,
      focusEntityId,
      sectionId: row.sectionId,
      itemId: row.item.id,
      xmlPath: row.item.xmlPath
    });
  };

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
        <label className="model-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder={filterPlaceholder}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {items.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <SortableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openItemTab(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openItemTab(row);
                    }
                  }}
                >
                  {columns.map((column) => (
                    <td key={column.key}>{String(row[column.key] ?? "-") || "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching items.</div>}
        </div>
      ) : (
        <div className="empty-state">{emptyLabel}</div>
      )}
    </div>
  );
}

type SortDirection = "asc" | "desc";
type RunnableTableColumnKey = "swcName" | "runnableName" | "runnableSymbol" | "period";
type PortTableColumnKey = "portName" | "direction" | "isServicePort" | "interfaceName" | "interfaceRef";
type AccessPointTableColumnKey = "target" | "access" | "name";
type TriggerEventTableColumnKey = "trigger" | "type" | "disabledInModes" | "activationReason" | "name";

interface RunnableTableRow {
  runnable: SwcInspectorItem;
  swcName: string;
  runnableName: string;
  runnableSymbol: string;
  period: string;
  periodSortValue: number;
}

interface PortTableRow {
  port: SwcGraphPort;
  portName: string;
  direction: string;
  isServicePort: string;
  interfaceName: string;
  interfaceRef: string;
}

interface InspectorTableItem {
  sectionId: SwcInspectorSectionId;
  sectionLabel: string;
  item: SwcInspectorItem;
  filePath?: string;
}

type InspectorTableRow = {
  id: string;
  item: SwcInspectorItem;
  sectionId: SwcInspectorSectionId;
  section: string;
  label: string;
  filePath?: string;
  xmlPath?: string;
} & Record<string, string | SwcInspectorItem | SwcInspectorSectionId | undefined>;

function SortableTableHeader<Key extends string>(props: {
  label: string;
  columnKey: Key;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key) => void;
}) {
  const { label, columnKey, sort, onSort } = props;
  const isActive = sort.key === columnKey;
  const indicatorClass = isActive ? `is-${sort.direction}` : "is-unsorted";

  return (
    <th scope="col" aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="model-sort-header-button"
        onClick={() => onSort(columnKey)}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={`model-sort-indicator ${indicatorClass}`} aria-hidden="true" />
      </button>
    </th>
  );
}

function SortableResizableTableHeader<Key extends string>(props: {
  label: string;
  columnKey: Key;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key) => void;
  onResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const { label, columnKey, sort, onSort, onResize } = props;
  const isActive = sort.key === columnKey;
  const indicatorClass = isActive ? `is-${sort.direction}` : "is-unsorted";

  return (
    <th aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="model-sort-header-button"
        onClick={() => onSort(columnKey)}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={`model-sort-indicator ${indicatorClass}`} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="model-runnable-column-resizer"
        aria-label={`Resize ${label} column`}
        onPointerDown={onResize}
      />
    </th>
  );
}

function compareRunnableRows(
  left: RunnableTableRow,
  right: RunnableTableRow,
  sort: { key: RunnableTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "period") {
    return direction * compareNumbersOrText(left.periodSortValue, right.periodSortValue, left.period, right.period);
  }

  const leftValue = left[sort.key];
  const rightValue = right[sort.key];
  return direction * compareTableText(leftValue, rightValue);
}

function comparePortRows(
  left: PortTableRow,
  right: PortTableRow,
  sort: { key: PortTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

function compareAccessPointRows(
  left: RunnableAccessPointDetail,
  right: RunnableAccessPointDetail,
  sort: { key: AccessPointTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

function compareTriggerEventRows(
  left: RunnableTriggerEventDetail,
  right: RunnableTriggerEventDetail,
  sort: { key: TriggerEventTableColumnKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return direction * compareTableText(left[sort.key], right[sort.key]);
}

function compareNumbersOrText(leftNumber: number, rightNumber: number, leftText: string, rightText: string) {
  const leftFinite = Number.isFinite(leftNumber);
  const rightFinite = Number.isFinite(rightNumber);
  if (leftFinite && rightFinite) {
    return leftNumber - rightNumber;
  }
  if (leftFinite) {
    return -1;
  }
  if (rightFinite) {
    return 1;
  }
  return compareTableText(leftText, rightText);
}

function compareTableText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeTableSearch(value: string) {
  return value.trim().toLowerCase();
}

function ModelTableSurface(props: {
  title: string;
  emptyLabel: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | undefined>>;
}) {
  const { title, emptyLabel, columns, rows } = props;
  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      {rows.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id ?? JSON.stringify(row)}>
                  {columns.map((column) => (
                    <td key={column.key}>{row[column.key] || "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">{emptyLabel}</div>
      )}
    </div>
  );
}

function ModelKeyValueSurface(props: {
  title: string;
  rows: Array<[string, string]>;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, rows } = props;
  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-semantic-kv">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "-"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EntityDetailPayload {
  fields: Array<{ label: string; value: string; valueType?: string }>;
  tables: Array<{
    title: string;
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, string>>;
  }>;
}

interface InterfaceDetailMember {
  label: string;
  kind?: string;
  semanticPath?: string;
  metadata?: Record<string, string>;
}

function ModelEntityDetailsSurface(props: { title: string; entity: AutosarEntity }) {
  const { title, entity } = props;
  const metadata = entity.metadata ?? {};
  const details = parseEntityDetailPayload(metadata["ENTITY-DETAILS"]);
  const interfaceMembers = entity.type === "interface"
    ? parseInterfaceDetailMembers(metadata["INTERFACE-DATA-ELEMENT-DETAILS"])
    : [];
  const interfaceTables = entity.type === "interface"
    ? buildInterfaceDetailTables(entity, interfaceMembers)
    : [];
  const interfaceType = details.fields.find((field) => field.label === "Interface Type")?.value ?? "-";
  const isService = details.fields.find((field) => field.label === "Is Service")?.value ?? "false";
  const fields = entity.type === "interface"
    ? [
        { label: "Name", value: entity.shortName },
        { label: "Port Interface Type", value: interfaceType },
        { label: "Package", value: entity.parentSemanticPath ?? entity.packagePath ?? "-" },
        { label: "Is Service", value: isService },
        { label: "Description", value: metadata.DESCRIPTION ?? "-" },
        ...details.fields.filter(
          (field) => field.label !== "Interface Type" && field.label !== "Is Service" && field.label !== "Service Kind"
        )
      ]
    : [
        { label: "Name", value: entity.shortName },
        { label: "AUTOSAR Type", value: formatAutosarTagText(entity.rawTagName) },
        { label: "Package Path", value: entity.parentSemanticPath ?? entity.packagePath ?? "-" },
        ...(metadata.DESCRIPTION ? [{ label: "Description", value: metadata.DESCRIPTION }] : []),
        ...details.fields
      ];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {fields.map((field, index) => (
            <div key={`${field.label}:${index}`}>
              <span>{field.label}</span>
              <strong title={field.value}>
                {entity.type === "interface" && field.label === "Is Service" ? (
                  <input type="checkbox" checked={readBooleanMetadata(field.value) === true} disabled readOnly />
                ) : field.valueType ? (
                  <span className="model-inline-value-with-select">
                    <select value={formatInitValueTypeOption(field.valueType)} disabled>
                      {initValueTypeOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    <ModelInitValueDisplay value={field.value} type={field.valueType} />
                  </span>
                ) : field.label === "Package Path" || field.label === "Package" ? field.value : field.value.startsWith("/") ? formatReferenceShortName(field.value) : field.value}
              </strong>
            </div>
          ))}
        </div>
        {entity.type === "interface" && entity.interfaceKind === "sender-receiver" ? (
          <ModelInterfaceDataElementsSection members={interfaceMembers} />
        ) : null}
        {entity.type === "interface" && entity.interfaceKind === "client-server" ? (
          <ModelInterfaceOperationsSection members={interfaceMembers} />
        ) : null}
        {[...details.tables, ...interfaceTables].map((table) => (
          <ModelEntityDetailTable key={table.title} table={table} />
        ))}
      </div>
    </div>
  );
}

function ModelEntityDetailTable(props: { table: EntityDetailPayload["tables"][number] }) {
  const { table } = props;
  return (
    <section className="model-port-argument-section">
      <h3>{table.title}</h3>
      {table.rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead><tr>{table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={`${table.title}:${index}`}>
                  {table.columns.map((column) => {
                    const value = row[column.key] || "-";
                    return <td key={column.key} title={value}>{value.startsWith("/") ? formatReferenceShortName(value) : value}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="model-list-empty">No {table.title.toLowerCase()} discovered.</div>}
    </section>
  );
}

function ModelInterfaceDataElementsSection(props: { members: InterfaceDetailMember[] }) {
  const dataElements = props.members.filter((member) => member.kind === "dataElement");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    dataElements[0]?.semanticPath ?? dataElements[0]?.label
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedElement =
    dataElements.find((member) => (member.semanticPath ?? member.label) === selectedKey) ?? dataElements[0];

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) return;

    let frameId = 0;
    const updateHeight = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const availableHeight = window.innerHeight - tableWrap.getBoundingClientRect().top - 12;
        setTableViewportHeight(Math.max(260, availableHeight));
      });
    };
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(document.body);
    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, true);
    updateHeight();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("scroll", updateHeight, true);
    };
  }, [dataElements.length]);

  return (
    <section className="model-port-argument-section model-port-comspec-section">
      <h3>Data Elements</h3>
      {dataElements.length > 0 ? (
        <div className="model-comspec-master-detail">
          <div
            ref={tableWrapRef}
            className="model-runnable-table-scroll model-comspec-table-wrap"
            style={tableViewportHeight ? { height: `${tableViewportHeight}px` } : undefined}
          >
            <table className="model-runnable-table">
              <thead>
                <tr><th style={{ width: "70px" }}>Index</th><th>Data Element</th></tr>
              </thead>
              <tbody>
                {dataElements.map((member, index) => {
                  const key = member.semanticPath ?? member.label;
                  const isSelected = key === (selectedElement?.semanticPath ?? selectedElement?.label);
                  return (
                    <tr key={key} className={isSelected ? "is-selected" : undefined}>
                      <td>{index + 1}</td>
                      <td title={member.semanticPath ?? member.label}>
                        <button
                          type="button"
                          className="model-table-cell-button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedKey(key)}
                        >
                          {member.label}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="model-comspec-detail-panel" aria-label="Data Element details">
            {selectedElement ? (
              <>
                <div className="model-comspec-detail-heading">
                  <span>Data Element</span>
                  <strong title={selectedElement.semanticPath}>{selectedElement.label}</strong>
                </div>
                <ModelInterfaceDataElementDetails member={selectedElement} />
              </>
            ) : <div className="model-list-empty">Select a data element.</div>}
          </aside>
        </div>
      ) : <div className="model-list-empty">No data elements discovered.</div>}
    </section>
  );
}

function ModelInterfaceDataElementDetails(props: { member: InterfaceDetailMember }) {
  const metadata = props.member.metadata ?? {};
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title="Data Element Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div><span>Data Type</span><strong>{formatReferenceShortName(metadata.TYPE)}</strong></div>
          <div><span>Data Constraints</span><strong>{formatReferenceShortName(metadata["DATA-CONSTRAINTS"])}</strong></div>
          <div><span>Addressing Method</span><strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong></div>
          <div>
            <span>Use queued communication</span>
            <strong><input type="checkbox" checked={readBooleanMetadata(metadata["IS-QUEUED"]) === true} disabled readOnly /></strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option><option>Read</option><option>Write</option><option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong>
              <select value={formatHandleInvalidOption(metadata["HANDLE-INVALID"] ?? "-")} disabled>
                <option>Keep</option><option>Replace</option><option>None</option>
              </select>
            </strong>
          </div>
          <div><span>Description</span><strong>{metadata.DESCRIPTION ?? "-"}</strong></div>
        </div>
      </ModelCommunicationSpecSubsection>
    </div>
  );
}

function ModelInterfaceOperationsSection(props: { members: InterfaceDetailMember[] }) {
  const operations = props.members.filter((member) => member.kind === "operation");
  const applicationErrors = props.members
    .filter((member) => member.kind === "applicationError")
    .slice()
    .sort((left, right) =>
      compareAutosarErrorCodes(left.metadata?.["ERROR-CODE"] ?? "-", right.metadata?.["ERROR-CODE"] ?? "-") ||
      compareTableText(left.label, right.label)
    );
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    operations[0]?.semanticPath ?? operations[0]?.label
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedOperation =
    operations.find((member) => (member.semanticPath ?? member.label) === selectedKey) ?? operations[0];

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) return;

    let frameId = 0;
    const updateHeight = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const availableHeight = window.innerHeight - tableWrap.getBoundingClientRect().top - 12;
        setTableViewportHeight(Math.max(260, availableHeight));
      });
    };
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(document.body);
    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, true);
    updateHeight();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("scroll", updateHeight, true);
    };
  }, [operations.length]);

  return (
    <section className="model-port-argument-section model-port-comspec-section">
      <h3>Operations</h3>
      {operations.length > 0 ? (
        <div className="model-comspec-master-detail">
          <div
            ref={tableWrapRef}
            className="model-runnable-table-scroll model-comspec-table-wrap"
            style={tableViewportHeight ? { height: `${tableViewportHeight}px` } : undefined}
          >
            <table className="model-runnable-table">
              <thead><tr><th style={{ width: "70px" }}>Index</th><th>Operation</th></tr></thead>
              <tbody>
                {operations.map((operation, index) => {
                  const key = operation.semanticPath ?? operation.label;
                  const isSelected = key === (selectedOperation?.semanticPath ?? selectedOperation?.label);
                  return (
                    <tr key={key} className={isSelected ? "is-selected" : undefined}>
                      <td>{index + 1}</td>
                      <td title={operation.semanticPath ?? operation.label}>
                        <button
                          type="button"
                          className="model-table-cell-button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedKey(key)}
                        >
                          {operation.label}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="model-comspec-detail-panel" aria-label="Operation details">
            {selectedOperation ? (
              <>
                <div className="model-comspec-detail-heading">
                  <span>Operation</span>
                  <strong title={selectedOperation.semanticPath}>{selectedOperation.label}</strong>
                </div>
                <ModelInterfaceOperationDetails operation={selectedOperation} applicationErrors={applicationErrors} />
              </>
            ) : <div className="model-list-empty">Select an operation.</div>}
          </aside>
        </div>
      ) : <div className="model-list-empty">No operations discovered.</div>}
    </section>
  );
}

function ModelInterfaceOperationDetails(props: {
  operation: InterfaceDetailMember;
  applicationErrors: InterfaceDetailMember[];
}) {
  const metadata = props.operation.metadata ?? {};
  const argumentsRows = parseOperationArgumentDetails(metadata["ARGUMENT-DETAILS"]);
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title="Operation Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Fire and Forget</span>
            <strong><input type="checkbox" checked={readBooleanMetadata(metadata["FIRE-AND-FORGET"]) === true} disabled readOnly /></strong>
          </div>
          <div>
            <span>Diagnostic Argument Integrity</span>
            <strong><input type="checkbox" checked={readBooleanMetadata(metadata["DIAG-ARG-INTEGRITY"]) === true} disabled readOnly /></strong>
          </div>
          <div><span>Description</span><strong>{metadata.DESCRIPTION ?? "-"}</strong></div>
        </div>
      </ModelCommunicationSpecSubsection>
      <ModelOperationPossibleErrors
        applicationErrors={props.applicationErrors}
        selectedErrors={splitMetadataList(metadata.ERRORS)}
      />
      <ModelEntityDetailTable
        table={{
          title: "Arguments",
          columns: [
            { key: "name", label: "Name" },
            { key: "type", label: "Data Type" },
            { key: "direction", label: "Direction" },
            { key: "serverPolicy", label: "Server Argument Implementation Policy" }
          ],
          rows: argumentsRows
        }}
      />
    </div>
  );
}

function ModelOperationPossibleErrors(props: {
  applicationErrors: InterfaceDetailMember[];
  selectedErrors: string[];
}) {
  const selectedErrors = new Set(props.selectedErrors.map((error) => formatReferenceShortName(error)));
  return (
    <section className="model-port-argument-section">
      <h3>Possible Errors</h3>
      {props.applicationErrors.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table model-operation-errors-table">
            <thead>
              <tr>
                <th>Selected</th>
                <th>Error Code</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {props.applicationErrors.map((error) => (
                <tr key={error.semanticPath ?? error.label}>
                  <td>
                    <input type="checkbox" checked={selectedErrors.has(error.label)} disabled readOnly />
                  </td>
                  <td>{error.metadata?.["ERROR-CODE"] ?? "-"}</td>
                  <td title={error.label}>{error.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="model-list-empty">No application errors discovered.</div>}
    </section>
  );
}

function parseOperationArgumentDetails(value: string | undefined): Array<Record<string, string>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((argument) => ({
      name: typeof argument.name === "string" ? argument.name : "-",
      type: typeof argument.type === "string" ? argument.type : "-",
      direction: typeof argument.direction === "string" ? formatAutosarTagText(argument.direction) : "-",
      serverPolicy: typeof argument.serverPolicy === "string" ? formatAutosarTagText(argument.serverPolicy) : "-"
    }));
  } catch {
    return [];
  }
}

function parseEntityDetailPayload(value: string | undefined): EntityDetailPayload {
  if (!value) return { fields: [], tables: [] };
  try {
    const parsed = JSON.parse(value) as Partial<EntityDetailPayload>;
    return {
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      tables: Array.isArray(parsed.tables) ? parsed.tables : []
    };
  } catch {
    return { fields: [], tables: [] };
  }
}

function parseInterfaceDetailMembers(value: string | undefined): InterfaceDetailMember[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is InterfaceDetailMember => Boolean(entry && typeof entry === "object")) : [];
  } catch {
    return [];
  }
}

function buildInterfaceDetailTables(entity: AutosarEntity, members: InterfaceDetailMember[]): EntityDetailPayload["tables"] {
  const metadata = (member: InterfaceDetailMember) => member.metadata ?? {};
  if (entity.interfaceKind === "sender-receiver") {
    return [];
  }
  if (entity.interfaceKind === "client-server") {
    const applicationErrors = members
      .filter((member) => member.kind === "applicationError")
      .map((member) => ({
        name: member.label,
        code: metadata(member)["ERROR-CODE"] ?? "-"
      }))
      .sort((left, right) => compareAutosarErrorCodes(left.code, right.code) || compareTableText(left.name, right.name));
    return [
      {
        title: "Application Errors",
        columns: [{ key: "code", label: "Error Code" }, { key: "name", label: "Error" }],
        rows: applicationErrors
      }
    ];
  }

  if (entity.interfaceKind === "mode-switch") {
    return [{
      title: "Mode Groups",
      columns: [{ key: "name", label: "Name" }, { key: "type", label: "Mode Declaration Group" }],
      rows: members.filter((member) => member.kind === "modeGroup").map((member) => ({
        name: member.label, type: metadata(member).TYPE ?? "-"
      }))
    }];
  }

  if (entity.interfaceKind === "trigger") {
    return [{
      title: "Triggers",
      columns: [
        { key: "name", label: "Name" }, { key: "policy", label: "Implementation Policy" },
        { key: "period", label: "Trigger Period" }
      ],
      rows: members.filter((member) => member.kind === "trigger").map((member) => ({
        name: member.label,
        policy: metadata(member)["SW-IMPL-POLICY"] ?? "-",
        period: metadata(member)["TRIGGER-PERIOD"] ?? "-"
      }))
    }];
  }

  const expectedKind = entity.interfaceKind === "parameter" ? "parameter" : entity.interfaceKind === "nv-data" ? "nvData" : "dataElement";
  return [{
    title: entity.interfaceKind === "parameter" ? "Parameters" : entity.interfaceKind === "nv-data" ? "NV Data" : "Data Elements",
    columns: [
      { key: "name", label: "Name" }, { key: "type", label: "Data Type" },
      { key: "initValue", label: "Init Value" }, { key: "initType", label: "Init Value Type" },
      { key: "calibration", label: "Measurement&Calibration" }, { key: "addressing", label: "Addressing Method" }
    ],
    rows: members.filter((member) => member.kind === expectedKind).map((member) => ({
      name: member.label,
      type: metadata(member).TYPE ?? "-",
      initValue: metadata(member)["INITIAL-VALUE"] ?? "-",
      initType: formatInitValueTypeOption(metadata(member)["INITIAL-VALUE-TYPE"] ?? "-"),
      calibration: formatCalibrationAccess(metadata(member)["SW-CALIBRATION-ACCESS"]),
      addressing: metadata(member)["SW-ADDR-METHOD-REF"] ?? "-"
    }))
  }];
}

function compareAutosarErrorCodes(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumeric = Number.isFinite(leftNumber);
  const rightIsNumeric = Number.isFinite(rightNumber);
  if (leftIsNumeric && rightIsNumeric) return leftNumber - rightNumber;
  if (leftIsNumeric) return -1;
  if (rightIsNumeric) return 1;
  return compareTableText(left, right);
}

function ModelParameterSurface(props: { title: string; parameter?: SwcInspectorItem }) {
  const { title, parameter } = props;
  const metadata = parameter?.metadata ?? {};
  const scope = formatParameterScopeOption(metadata.SCOPE);
  const measurementCalibration = formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-");

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Parameter Name</span>
            <strong>{parameter?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
          <div>
            <span>Scope</span>
            <strong>
              <select value={scope} disabled>
                <option>-</option>
                <option>Shared</option>
                <option>Per Instance</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={measurementCalibration} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelInterRunnableVariableSurface(props: { title: string; variable?: SwcInspectorItem }) {
  const { title, variable } = props;
  const metadata = variable?.metadata ?? {};
  const accessRows = parseInterRunnableVariableAccesses(metadata["INTER-RUNNABLE-VARIABLE-ACCESS"]);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{variable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Communication</span>
            <strong>
              <select value={formatInterRunnableCommunicationOption(metadata.COMMUNICATION)} disabled>
                <option>-</option>
                <option>Explicit</option>
                <option>Implicit</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
        </div>
        <ModelInterRunnableVariableAccessTable rows={accessRows} />
      </div>
    </div>
  );
}

function ModelPerInstanceMemorySurface(props: { title: string; item?: SwcInspectorItem }) {
  const { title, item } = props;
  const metadata = item?.metadata ?? {};

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{item?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(metadata.TYPE)}</strong>
          </div>
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <select value={formatInitValueTypeOption(metadata["INITIAL-VALUE-TYPE"] ?? "-")} disabled>
                {initValueTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ModelInitValueDisplay
                value={metadata["INITIAL-VALUE"] ?? "-"}
                type={metadata["INITIAL-VALUE-TYPE"] ?? "-"}
              />
            </strong>
          </div>
          <div>
            <span>Nvm Block Need</span>
            <strong>{formatReferenceShortName(metadata["NVM-BLOCK-NEED"])}</strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(metadata["SW-CALIBRATION-ACCESS"] ?? "-")} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelServiceDependencySurface(props: { title: string; item?: SwcInspectorItem }) {
  const { title, item } = props;
  const metadata = item?.metadata ?? {};
  const serviceNeedDetails = parseServiceNeedDetailFields(
    metadata["SERVICE-NEED-DETAIL-FIELDS"],
    metadata["SERVICE-NEED-DETAILS"]
  );
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  const isNvBlockNeeds = serviceType === "nvblockneeds";
  const isDiagnosticEnableConditionNeeds = serviceType === "diagnosticenableconditionneeds";
  const detailRows = getServiceNeedDetailRows(item?.label, metadata, serviceNeedDetails);
  const assignedData = isNvBlockNeeds ? parseNvmAssignedDataDetails(metadata) : [];
  const dataAssignments = isDiagnosticEnableConditionNeeds
    ? parseServiceAssignedDataDetails(metadata["ASSIGNED-DATA-DETAILS"])
    : [];
  const assignedPorts = parseServiceAssignedPortDetails(metadata["ASSIGNED-PORT-DETAILS"]);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {detailRows.map((detail) => (
            <ModelServiceNeedDetailRow key={detail.label} detail={detail} />
          ))}
        </div>
        {isNvBlockNeeds ? <ModelNvmAssignedDataTable rows={assignedData} /> : null}
        {isDiagnosticEnableConditionNeeds ? <ModelServiceDataAssignmentsTable rows={dataAssignments} /> : null}
        <ModelServiceAssignedPortsTable
          rows={assignedPorts}
          title={isDiagnosticEnableConditionNeeds ? "Port Assignments" : "Assigned Ports"}
        />
      </div>
    </div>
  );
}

function ModelServiceNeedDetailRow(props: { detail: ServiceNeedDisplayDetail }) {
  const { detail } = props;
  return (
    <div>
      <span>{detail.label}</span>
      <strong>
        {detail.kind === "checkbox" ? (
          <input type="checkbox" checked={detail.checked === true} disabled readOnly />
        ) : detail.kind === "checkboxDropdown" ? (
          <span className="model-inline-value-with-select">
            <input type="checkbox" checked={detail.checked === true} disabled readOnly />
            <select value={detail.value || "-"} disabled>
              {getServiceNeedSelectOptions(detail.value || "-", detail.options).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </span>
        ) : detail.kind === "dropdown" ? (
          <select value={detail.value || "-"} disabled>
            <option>{detail.value || "-"}</option>
          </select>
        ) : !graphResult && requiresGraphData(activeWorkspaceTab.kind) ? (
          <div className="empty-state">
            {error ? `Could not load AUTOSAR details: ${error}` : "Loading AUTOSAR details..."}
          </div>
        ) : (
          detail.value
        )}
      </strong>
    </div>
  );
}

function ModelNvmAssignedDataTable(props: { rows: NvmAssignedDataDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>NVM Assigned Data</h3>
      <div className="model-runnable-table-scroll">
        <table className="model-runnable-table">
          <thead>
            <tr>
              <th>Assigned Role</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.role}>
                <td title={row.role}>{row.role}</td>
                <td title={row.value}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelServiceDataAssignmentsTable(props: { rows: ServiceAssignedDataDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Data Assignments</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Port Prototype</th>
                <th>Port Interface</th>
                <th>Data Element Prototype</th>
                <th>Assigned Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.portPrototype}:${row.dataElementPrototype}:${row.assignedRole}:${index}`}>
                  <td title={row.portPrototypeRef ?? row.portPrototype}>{row.portPrototype}</td>
                  <td title={row.portInterfaceRef ?? row.portInterface}>{row.portInterface}</td>
                  <td title={row.dataElementPrototypeRef ?? row.dataElementPrototype}>{row.dataElementPrototype}</td>
                  <td title={row.assignedRole}>{row.assignedRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No data assignments discovered.</div>
      )}
    </section>
  );
}

function ModelServiceAssignedPortsTable(props: { rows: ServiceAssignedPortDetail[]; title?: string }) {
  const { rows, title = "Assigned Ports" } = props;
  return (
    <section className="model-port-argument-section">
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Port Prototype</th>
                <th>Port Interface</th>
                <th>Assigned Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.portPrototype}:${row.assignedRole}:${index}`}>
                  <td title={row.portPrototypeRef ?? row.portPrototype}>{row.portPrototype}</td>
                  <td title={row.portInterfaceRef ?? row.portInterface}>{row.portInterface}</td>
                  <td title={row.assignedRole}>{row.assignedRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No assigned ports discovered.</div>
      )}
    </section>
  );
}

function ModelInterRunnableVariableAccessTable(props: { rows: InterRunnableVariableAccessDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Inter-Runnable Variable Access</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th>Runnable</th>
                <th>Access</th>
                <th>Access Point</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.runnable}:${row.access}:${row.accessPoint}:${index}`}>
                  <td title={row.runnable}>{row.runnable}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.accessPoint}>{row.accessPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No accessing runnables discovered.</div>
      )}
    </section>
  );
}

function ModelRunnableSurface(props: {
  title: string;
  runnable?: SwcInspectorItem;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, runnable } = props;
  const concurrent = readBooleanMetadata(runnable?.metadata?.CONCURRENT);
  const activationReasonDetails = parseRunnableActivationReasonDetails(
    runnable?.metadata?.["ACTIVATION-REASON-DETAILS"]
  );
  const accessPoints = splitMetadataList(runnable?.metadata?.["ACCESS-POINTS"]);
  const accessPointDetails = parseRunnableAccessPointDetails(runnable?.metadata?.["ACCESS-POINT-DETAILS"]);
  const triggerEvents = splitMetadataList(runnable?.metadata?.["TRIGGER-EVENTS"]);
  const triggerEventDetails = parseRunnableTriggerEventDetails(runnable?.metadata?.["TRIGGER-EVENT-DETAILS"]);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-runnable-detail">
        <div className="model-semantic-kv model-runnable-fields">
          <div>
            <span>Name</span>
            <strong>{runnable?.label ?? "-"}</strong>
          </div>
          <div>
            <span>Symbol</span>
            <strong>{runnable?.metadata?.SYMBOL ?? "-"}</strong>
          </div>
          <div>
            <span>Can Be Invoked Concurrently</span>
            <strong>
              <input type="checkbox" checked={concurrent === true} disabled readOnly />
            </strong>
          </div>
          <div>
            <span>Minimum Start Interval</span>
            <strong>{formatTimeInterval(runnable?.metadata?.["MIN-START-INTERVAL"])}</strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{runnable?.metadata?.["SW-ADDR-METHOD-REF"] ?? "-"}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{runnable?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>
        <ModelRunnableTriggerEventsTable details={triggerEventDetails} fallbackItems={triggerEvents} />
        <ModelRunnableAccessPointsTable details={accessPointDetails} fallbackItems={accessPoints} />
        <ModelRunnableActivationReasonsTable details={activationReasonDetails} />
      </div>
    </div>
  );
}

function ModelPortSurface(props: {
  title: string;
  port?: SwcGraphPort;
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, port } = props;
  const argumentValues = parsePortDefinedArgumentValues(port?.metadata?.["PORT-DEFINED-ARGUMENT-VALUES"]);
  const communicationSpecs = parseCommunicationSpecDetails(port?.metadata?.["COMMUNICATION-SPEC-DETAILS"]);
  const interfaceMemberDetails = parseInterfaceMemberDetails(port?.metadata?.["INTERFACE-MEMBER-DETAILS"]);
  const displayedSpecs = communicationSpecs.length > 0 ? communicationSpecs : interfaceMemberDetails;
  const specsTitle = communicationSpecs.length > 0 ? "Communication Specs" : "Interface Members";
  const interfaceKind = port?.interfaceKind ?? "unknown";
  const directionOptions = getPortDirectionOptions(interfaceKind);
  const directionLabel = formatPortDirectionLabel(port?.direction, interfaceKind);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{port?.label ?? title.replace(/^Port:\s*/, "")}</strong>
          </div>
          <div>
            <span>Port Interface</span>
            <strong>{formatReferenceShortName(port?.interfaceRef)}</strong>
          </div>
          <div>
            <span>Port Interface Type</span>
            <strong>{formatPortInterfaceKindLabel(interfaceKind)}</strong>
          </div>
          <div>
            <span>Direction</span>
            <strong>
              <select value={directionLabel} disabled>
                {directionOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </strong>
          </div>
          <div>
            <span>Is Service Port</span>
            <strong>{formatBooleanMetadata(port?.metadata?.["IS-SERVICE"])}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{port?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>

        <ModelPortApiOptionsSection port={port} argumentValues={argumentValues} />
        <ModelCommunicationSpecsSection rows={displayedSpecs} interfaceKind={interfaceKind} title={specsTitle} />
      </div>
    </div>
  );
}

function formatReferenceShortName(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const parts = value.split("/").filter(Boolean);
  return parts.at(-1) ?? value;
}

function formatAutosarTagText(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return value
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCalibrationAccess(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const normalized = value.trim().toUpperCase().replace(/[_\s]+/g, "-");
  if (normalized === "READ-WRITE" || normalized === "READWRITE") {
    return "ReadWrite";
  }
  if (normalized === "READ-ONLY" || normalized === "READONLY") {
    return "ReadOnly";
  }
  if (
    normalized === "NOT-ACCESSIBLE" ||
    normalized === "NOTACCESSIBLE" ||
    normalized === "NOT-ACCESSIBLE-NO-AUTOSAR" ||
    normalized === "NOTACCESSIBLENOAUTOSAR"
  ) {
    return "NotAccessible";
  }
  return value;
}

function formatParameterScopeOption(value: string | undefined): string {
  const normalized = normalizeAutosarEnumToken(value ?? "");
  if (!normalized) {
    return "-";
  }
  if (normalized.includes("perinstance")) {
    return "Per Instance";
  }
  if (normalized.includes("shared")) {
    return "Shared";
  }
  return "-";
}

function formatInterRunnableCommunicationOption(value: string | undefined): string {
  const normalized = normalizeAutosarEnumToken(value ?? "");
  if (normalized.includes("explicit")) {
    return "Explicit";
  }
  if (normalized.includes("implicit")) {
    return "Implicit";
  }
  return "-";
}

function formatPortDirectionLabel(direction: SwcGraphPort["direction"] | undefined, interfaceKind?: PortInterfaceKind) {
  if (interfaceKind === "client-server") {
    if (direction === "provided") {
      return "Server";
    }
    if (direction === "required") {
      return "Client";
    }
    return "Client/Server";
  }
  if (interfaceKind === "parameter") {
    if (direction === "provided") {
      return "Parameter Provider";
    }
    if (direction === "required") {
      return "Parameter Consumer";
    }
    return "Parameter Provider/Consumer";
  }
  if (interfaceKind === "mode-switch") {
    if (direction === "provided") {
      return "Mode Manager";
    }
    if (direction === "required") {
      return "Mode User";
    }
    return "Mode Manager/User";
  }
  if (interfaceKind === "trigger") {
    if (direction === "provided") {
      return "Trigger Provider";
    }
    if (direction === "required") {
      return "Trigger Consumer";
    }
    return "Trigger Provider/Consumer";
  }
  if (interfaceKind === "nv-data") {
    if (direction === "provided") {
      return "Nv Data Provider";
    }
    if (direction === "required") {
      return "Nv Data Consumer";
    }
    return "Nv Data Provider/Consumer";
  }
  if (direction === "provided") {
    return "Sender";
  }
  if (direction === "required") {
    return "Receiver";
  }
  return "Sender/Receiver";
}

function getPortDirectionOptions(interfaceKind: PortInterfaceKind) {
  if (interfaceKind === "client-server") {
    return ["Server", "Client", "Client/Server"];
  }
  if (interfaceKind === "parameter") {
    return ["Parameter Provider", "Parameter Consumer", "Parameter Provider/Consumer"];
  }
  if (interfaceKind === "mode-switch") {
    return ["Mode Manager", "Mode User", "Mode Manager/User"];
  }
  if (interfaceKind === "trigger") {
    return ["Trigger Provider", "Trigger Consumer", "Trigger Provider/Consumer"];
  }
  if (interfaceKind === "nv-data") {
    return ["Nv Data Provider", "Nv Data Consumer", "Nv Data Provider/Consumer"];
  }
  return ["Sender", "Receiver", "Sender/Receiver"];
}

function formatPortInterfaceKindLabel(interfaceKind: PortInterfaceKind | undefined) {
  if (interfaceKind === "sender-receiver") {
    return "SenderReceiverInterface";
  }
  if (interfaceKind === "client-server") {
    return "ClientServerInterface";
  }
  if (interfaceKind === "mode-switch") {
    return "ModeSwitchInterface";
  }
  if (interfaceKind === "nv-data") {
    return "NvDataInterface";
  }
  if (interfaceKind === "parameter") {
    return "ParameterInterface";
  }
  if (interfaceKind === "trigger") {
    return "TriggerInterface";
  }
  return "Unknown";
}

function getCommunicationSpecItemLabel(interfaceKind: PortInterfaceKind) {
  if (interfaceKind === "client-server") {
    return "Operation";
  }
  if (interfaceKind === "parameter") {
    return "Parameter";
  }
  if (interfaceKind === "nv-data") {
    return "Nv Data";
  }
  if (interfaceKind === "mode-switch") {
    return "Mode Group";
  }
  if (interfaceKind === "trigger") {
    return "Trigger";
  }
  return "Data Element";
}

function formatCommunicationSpecDirectionLabel(direction: string) {
  if (direction === "client") {
    return "Client";
  }
  if (direction === "server") {
    return "Server";
  }
  if (direction === "parameter") {
    return "Parameter";
  }
  if (direction === "nvData") {
    return "Nv Data";
  }
  if (direction === "mode") {
    return "Mode";
  }
  if (direction === "trigger") {
    return "Trigger";
  }
  return "Generic";
}

interface PortDefinedArgumentValueDetail {
  index: string;
  name: string;
  dataType: string;
  value: string;
}

interface CommunicationSpecDetail {
  index: string;
  dataElement: string;
  comSpec: string;
  comSpecDirection: string;
  initValue: string;
  initValueType: string;
  usesTxAcknowledge: string;
  transmissionAcknowledgeTimeout: string;
  usesEndToEndProtection: string;
  handleOutOfRange: string;
  transmissionMode: string;
  dataUpdatePeriod: string;
  minimumSendInterval: string;
  aliveTimeout: string;
  enableUpdate: string;
  handleNeverReceived: string;
  usesEndToEndProtectionErrorHandling: string;
  timeoutSubstitutionValue: string;
  timeoutSubstitutionValueType: string;
  handleTimeoutType: string;
  rxFilter: string;
  handleDataStatus: string;
  queueLength: string;
  dataType: string;
  dataConstraints: string;
  addressingMethod: string;
  useQueuedCommunication: string;
  measurementCalibration: string;
  handleInvalid: string;
}

function ModelPortApiOptionsSection(props: {
  port?: SwcGraphPort;
  argumentValues: PortDefinedArgumentValueDetail[];
}) {
  const { port, argumentValues } = props;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="model-list-section model-port-api-section">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>Port API Options</span>
      </button>
      {isExpanded && (
        <>
          <div className="model-semantic-kv model-port-fields">
            <div>
              <span>Enable indirect API</span>
              <strong>
                <input
                  type="checkbox"
                  checked={readBooleanMetadata(port?.metadata?.["ENABLE-INDIRECT-API"]) === true}
                  disabled
                  readOnly
                />
              </strong>
            </div>
            <div>
              <span>Enable API usage by address</span>
              <strong>
                <input
                  type="checkbox"
                  checked={readBooleanMetadata(port?.metadata?.["ENABLE-API-USAGE-BY-ADDRESS"]) === true}
                  disabled
                  readOnly
                />
              </strong>
            </div>
            <div>
              <span>Transformation Error Handling</span>
              <strong>
                <input
                  type="checkbox"
                  checked={readTransformationErrorHandlingMetadata(port?.metadata?.["TRANSFORMATION-ERROR-HANDLING"])}
                  disabled
                  readOnly
                />
              </strong>
            </div>
          </div>
          <ModelPortDefinedArgumentTable rows={argumentValues} />
        </>
      )}
    </section>
  );
}

function ModelCommunicationSpecsSection(props: {
  rows: CommunicationSpecDetail[];
  interfaceKind: PortInterfaceKind;
  title?: string;
}) {
  const { rows, interfaceKind, title = "Communication Specs" } = props;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="model-list-section model-port-comspec-section">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>{title}</span>
        <span className="model-list-section-count">{rows.length}</span>
      </button>
      {isExpanded && <ModelCommunicationSpecsTable rows={rows} interfaceKind={interfaceKind} embedded />}
    </section>
  );
}

function ModelPortDefinedArgumentTable(props: { rows: PortDefinedArgumentValueDetail[] }) {
  const { rows } = props;
  return (
    <section className="model-port-argument-section">
      <h3>Port defined argument values</h3>
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>Index</th>
                <th>Name</th>
                <th>Data type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.index}:${row.name}:${row.dataType}:${row.value}`}>
                  <td title={row.index}>{row.index}</td>
                  <td title={row.name}>{row.name}</td>
                  <td title={row.dataType}>{row.dataType}</td>
                  <td title={row.value}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No port defined argument values discovered.</div>
      )}
    </section>
  );
}

function ModelCommunicationSpecsTable(props: {
  rows: CommunicationSpecDetail[];
  interfaceKind: PortInterfaceKind;
  embedded?: boolean;
}) {
  const { rows, interfaceKind, embedded } = props;
  const itemLabel = getCommunicationSpecItemLabel(interfaceKind);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    rows[0] ? getCommunicationSpecRowKey(rows[0]) : undefined
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState<number>();
  const selectedRow = rows.find((row) => getCommunicationSpecRowKey(row) === selectedKey) ?? rows[0];

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) {
      return;
    }

    let frameId = 0;
    const updateHeight = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const availableHeight = window.innerHeight - tableWrap.getBoundingClientRect().top - 12;
        setTableViewportHeight(Math.max(260, availableHeight));
      });
    };
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(document.body);
    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, true);
    updateHeight();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("scroll", updateHeight, true);
    };
  }, [embedded, rows.length]);

  return (
    <section className={embedded ? "model-port-comspec-table-section" : "model-list-section model-port-comspec-section"}>
      {!embedded && <h3>Communication Specs</h3>}
      {rows.length > 0 ? (
        <div className="model-comspec-master-detail">
          <div
            ref={tableWrapRef}
            className="model-runnable-table-scroll model-comspec-table-wrap"
            style={tableViewportHeight ? { height: `${tableViewportHeight}px` } : undefined}
          >
            <table className="model-runnable-table">
              <thead>
                <tr>
                  <th style={{ width: "70px" }}>Index</th>
                  <th>{itemLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowKey = getCommunicationSpecRowKey(row);
                  const isSelected = selectedRow ? rowKey === getCommunicationSpecRowKey(selectedRow) : false;
                  return (
                    <tr key={rowKey} className={isSelected ? "is-selected" : undefined}>
                      <td title={row.index}>{row.index}</td>
                      <td title={row.dataElement}>
                        <button
                          type="button"
                          className="model-table-cell-button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedKey(rowKey)}
                        >
                          {formatReferenceShortName(row.dataElement)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <aside className="model-comspec-detail-panel" aria-label={`${itemLabel} details`}>
            {selectedRow ? (
              <>
                <div className="model-comspec-detail-heading">
                  <span>{itemLabel}</span>
                  <strong title={selectedRow.dataElement}>{formatReferenceShortName(selectedRow.dataElement)}</strong>
                </div>
                <ModelCommunicationSpecDetails row={selectedRow} itemLabel={itemLabel} />
              </>
            ) : (
              <div className="model-list-empty">Select a communication spec.</div>
            )}
          </aside>
        </div>
      ) : (
        <div className="model-list-empty">No communication specs discovered.</div>
      )}
    </section>
  );
}

function getCommunicationSpecRowKey(row: CommunicationSpecDetail) {
  return `${row.index}:${row.dataElement}:${row.comSpec}:${row.initValue}`;
}

function ModelCommunicationSpecDetails(props: { row: CommunicationSpecDetail; itemLabel: string }) {
  const { row, itemLabel } = props;
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title={`${itemLabel} Properties`} defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Data Type</span>
            <strong>{formatReferenceShortName(row.dataType)}</strong>
          </div>
          <div>
            <span>Data Constraints</span>
            <strong>{formatReferenceShortName(row.dataConstraints)}</strong>
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(row.addressingMethod)}</strong>
          </div>
          <div>
            <span>Use queued communication</span>
            <strong>
              <input type="checkbox" checked={readBooleanMetadata(row.useQueuedCommunication) === true} disabled readOnly />
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select value={formatMeasurementCalibrationOption(row.measurementCalibration)} disabled>
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong>
              <select value={formatHandleInvalidOption(row.handleInvalid)} disabled>
                <option>Keep</option>
                <option>Replace</option>
                <option>None</option>
              </select>
            </strong>
          </div>
        </div>
      </ModelCommunicationSpecSubsection>

      {row.comSpecDirection === "sender" && <ModelSenderComSpecDetails row={row} />}
      {row.comSpecDirection === "receiver" && <ModelReceiverComSpecDetails row={row} />}
      {row.comSpecDirection !== "sender" && row.comSpecDirection !== "receiver" && (
        <ModelGenericComSpecDetails row={row} />
      )}
    </div>
  );
}

function ModelSenderComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <ModelCommunicationSpecSubsection title="Sender ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ModelInitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div className="model-semantic-kv-three">
          <span>Uses Tx Acknowledge</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.usesTxAcknowledge) === true} disabled readOnly />
          </strong>
          <strong className="model-inline-value-with-label">
            <small>Timeout (ms)</small>
            {formatOptionalMilliseconds(row.transmissionAcknowledgeTimeout)}
          </strong>
        </div>
        <div>
          <span>Uses End-to-End Protection</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.usesEndToEndProtection) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Handle Out of Range</span>
          <strong>
            <select value={formatHandleOutOfRangeOption(row.handleOutOfRange)} disabled>
              {handleOutOfRangeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
      </div>
      <section className="model-port-argument-section">
        <h3>Use Transmission Props</h3>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Transmission Mode</span>
            <strong>
              <select value={formatTransmissionModeOption(row.transmissionMode)} disabled>
                {transmissionModeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </strong>
          </div>
          <div>
            <span>Data Update Period</span>
            <strong>{formatOptionalMilliseconds(row.dataUpdatePeriod)}</strong>
          </div>
          <div>
            <span>Minimum Send Interval</span>
            <strong>{formatOptionalMilliseconds(row.minimumSendInterval)}</strong>
          </div>
        </div>
      </section>
    </ModelCommunicationSpecSubsection>
  );
}

function ModelReceiverComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <ModelCommunicationSpecSubsection title="Receiver ComSpec" defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ModelInitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div>
          <span>Rx Filter</span>
          <strong>
            <select value={formatRxFilterOption(row.rxFilter)} disabled>
              {getRxFilterOptions(row.rxFilter).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
        <div>
          <span>Uses End-to-End Protection</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.usesEndToEndProtection) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Handle Never Received</span>
          <strong>
            <input type="checkbox" checked={readEnabledMetadata(row.handleNeverReceived)} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Enable Update</span>
          <strong>
            <input type="checkbox" checked={readBooleanMetadata(row.enableUpdate) === true} disabled readOnly />
          </strong>
        </div>
        <div>
          <span>Alive Timeout</span>
          <strong>{formatOptionalMilliseconds(row.aliveTimeout)}</strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{row.queueLength}</strong>
        </div>
        <div>
          <span>Handle Out Of Range</span>
          <strong>
            <select value={formatHandleOutOfRangeOption(row.handleOutOfRange)} disabled>
              {handleOutOfRangeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </strong>
        </div>
      </div>
    </ModelCommunicationSpecSubsection>
  );
}

function ModelGenericComSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <ModelCommunicationSpecSubsection title={`${formatCommunicationSpecDirectionLabel(row.comSpecDirection)} ComSpec`} defaultOpen>
      <div className="model-semantic-kv model-port-fields">
        <div>
          <span>Init Value</span>
          <strong className="model-inline-value-with-select">
            <select value={formatInitValueTypeOption(row.initValueType)} disabled>
              {initValueTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ModelInitValueDisplay value={row.initValue} type={row.initValueType} />
          </strong>
        </div>
        <div>
          <span>Queue Length</span>
          <strong>{row.queueLength}</strong>
        </div>
      </div>
    </ModelCommunicationSpecSubsection>
  );
}

function ModelCommunicationSpecSubsection(props: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const { title, defaultOpen = false, children } = props;
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <section className="model-list-section model-communication-subsection">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>{title}</span>
      </button>
      {isExpanded && children}
    </section>
  );
}

interface RunnableAccessPointDetail {
  target: string;
  access: string;
  name: string;
}

interface InterRunnableVariableAccessDetail {
  runnable: string;
  access: string;
  accessPoint: string;
}

interface RunnableActivationReasonDetail {
  bit: string;
  name: string;
  symbol: string;
}

interface RunnableTriggerEventDetail {
  trigger: string;
  type: string;
  disabledInModes: string;
  activationReason: string;
  name: string;
}

function ModelRunnableActivationReasonsTable(props: { details: RunnableActivationReasonDetail[] }) {
  const { details } = props;

  return (
    <section className="model-list-section model-activation-reasons-section">
      <h3>Activation Reasons</h3>
      {details.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th style={{ width: "90px" }}>Bit</th>
                <th>Name</th>
                <th>Symbol</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row, index) => (
                <tr key={`${row.bit}:${row.name}:${row.symbol}:${index}`}>
                  <td title={row.bit}>{row.bit}</td>
                  <td title={row.name}>{row.name}</td>
                  <td title={row.symbol}>{row.symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No activation reasons discovered.</div>
      )}
    </section>
  );
}

function ModelRunnableAccessPointsTable(props: { details: RunnableAccessPointDetail[]; fallbackItems: string[] }) {
  const { details, fallbackItems } = props;
  const [columnWidths, setColumnWidths] = useState([280, 180, 260]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: AccessPointTableColumnKey; direction: SortDirection }>({
    key: "target",
    direction: "asc"
  });
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          target: "-",
          access: "-",
          name: item
        }));
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.target, row.access, row.name].some((value) => normalizeTableSearch(value).includes(normalizedQuery))
          : true
      )
      .sort((left, right) => compareAccessPointRows(left, right, sort));
  }, [rows, searchQuery, sort]);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const changeSort = (key: AccessPointTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex] ?? 180;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((currentWidths) =>
        currentWidths.map((width, index) => (index === columnIndex ? Math.max(120, startWidth + delta) : width))
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <section className="model-list-section model-access-points-section">
      <div className="model-list-section-header">
        <button
          type="button"
          className="model-list-section-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="model-list-section-chevron" aria-hidden="true" />
          <span>Access Points</span>
          <span className="model-list-section-count">{visibleRows.length}</span>
        </button>
        <label className="model-table-search model-list-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter access points"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {isExpanded && rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table"
            style={{ "--model-runnable-table-width": `${tableWidth}px` } as CSSProperties}
          >
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "DEP / Operation / Trigger", key: "target" as const },
                  { label: "Access", key: "access" as const },
                  { label: "Name", key: "name" as const }
                ].map((column, index) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => startColumnResize(event, index)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.name}:${row.access}:${row.target}:${index}`}>
                  <td title={row.target}>{row.target}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching access points.</div>}
        </div>
      ) : isExpanded ? (
        <div className="model-list-empty">No items discovered.</div>
      ) : null}
    </section>
  );
}

function ModelRunnableTriggerEventsTable(props: { details: RunnableTriggerEventDetail[]; fallbackItems: string[] }) {
  const { details, fallbackItems } = props;
  const [columnWidths, setColumnWidths] = useState([220, 180, 180, 180, 240]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: TriggerEventTableColumnKey; direction: SortDirection }>({
    key: "trigger",
    direction: "asc"
  });
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          trigger: "-",
          type: "-",
          disabledInModes: "-",
          activationReason: "-",
          name: item
        }));
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeTableSearch(searchQuery);
    return rows
      .filter((row) =>
        normalizedQuery
          ? [row.trigger, row.type, row.disabledInModes, row.activationReason, row.name].some((value) =>
              normalizeTableSearch(value).includes(normalizedQuery)
            )
          : true
      )
      .sort((left, right) => compareTriggerEventRows(left, right, sort));
  }, [rows, searchQuery, sort]);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const changeSort = (key: TriggerEventTableColumnKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const startColumnResize = (event: ReactPointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex] ?? 180;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((currentWidths) =>
        currentWidths.map((width, index) => (index === columnIndex ? Math.max(120, startWidth + delta) : width))
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <section className="model-list-section model-trigger-events-section">
      <div className="model-list-section-header">
        <button
          type="button"
          className="model-list-section-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="model-list-section-chevron" aria-hidden="true" />
          <span>Trigger Events</span>
          <span className="model-list-section-count">{visibleRows.length}</span>
        </button>
        <label className="model-table-search model-list-table-search">
          <span>Search</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Filter trigger events"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>
      {isExpanded && rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table
            className="model-runnable-table"
            style={{ "--model-runnable-table-width": `${tableWidth}px` } as CSSProperties}
          >
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "Trigger", key: "trigger" as const },
                  { label: "Type", key: "type" as const },
                  { label: "Disable in modes", key: "disabledInModes" as const },
                  { label: "Activation Reason", key: "activationReason" as const },
                  { label: "Name", key: "name" as const }
                ].map((column, index) => (
                  <SortableResizableTableHeader
                    key={column.key}
                    label={column.label}
                    columnKey={column.key}
                    sort={sort}
                    onSort={changeSort}
                    onResize={(event) => startColumnResize(event, index)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.name}:${row.type}:${row.trigger}:${index}`}>
                  <td title={row.trigger}>{row.trigger}</td>
                  <td title={row.type}>{row.type}</td>
                  <td title={row.disabledInModes}>{row.disabledInModes}</td>
                  <td title={row.activationReason}>{row.activationReason}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="model-table-filter-empty">No matching trigger events.</div>}
        </div>
      ) : isExpanded ? (
        <div className="model-list-empty">No items discovered.</div>
      ) : null}
    </section>
  );
}

function parseRunnableAccessPointDetails(value: string | undefined): RunnableAccessPointDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          target: stringifyAccessPointCell(record.target),
          access: stringifyAccessPointCell(record.access),
          name: stringifyAccessPointCell(record.name)
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseInterRunnableVariableAccesses(value: string | undefined): InterRunnableVariableAccessDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          runnable: stringifyAccessPointCell(record.runnable),
          access: stringifyAccessPointCell(record.access),
          accessPoint: stringifyAccessPointCell(record.accessPoint)
        }
      ];
    });
  } catch {
    return [];
  }
}

function stringifyAccessPointCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function stringifyOptionalCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parsePortDefinedArgumentValues(value: string | undefined): PortDefinedArgumentValueDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          index: stringifyAccessPointCell(record.index),
          name: stringifyAccessPointCell(record.name),
          dataType: stringifyAccessPointCell(record.dataType),
          value: stringifyAccessPointCell(record.value)
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseCommunicationSpecDetails(value: string | undefined): CommunicationSpecDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          index: stringifyAccessPointCell(record.index),
          dataElement: stringifyAccessPointCell(record.dataElement),
          comSpec: stringifyAccessPointCell(record.comSpec),
          comSpecDirection: parseCommunicationSpecDirection(record.comSpecDirection, record.comSpec),
          initValue: stringifyAccessPointCell(record.initValue),
          initValueType: stringifyAccessPointCell(record.initValueType),
          usesTxAcknowledge: stringifyAccessPointCell(record.usesTxAcknowledge),
          transmissionAcknowledgeTimeout: stringifyAccessPointCell(record.transmissionAcknowledgeTimeout),
          usesEndToEndProtection: stringifyAccessPointCell(record.usesEndToEndProtection),
          handleOutOfRange: stringifyAccessPointCell(record.handleOutOfRange),
          transmissionMode: stringifyAccessPointCell(record.transmissionMode),
          dataUpdatePeriod: stringifyAccessPointCell(record.dataUpdatePeriod),
          minimumSendInterval: stringifyAccessPointCell(record.minimumSendInterval),
          aliveTimeout: stringifyAccessPointCell(record.aliveTimeout),
          enableUpdate: stringifyAccessPointCell(record.enableUpdate),
          handleNeverReceived: stringifyAccessPointCell(record.handleNeverReceived),
          usesEndToEndProtectionErrorHandling: stringifyAccessPointCell(
            record.usesEndToEndProtectionErrorHandling
          ),
          timeoutSubstitutionValue: stringifyAccessPointCell(record.timeoutSubstitutionValue),
          timeoutSubstitutionValueType: stringifyAccessPointCell(record.timeoutSubstitutionValueType),
          handleTimeoutType: stringifyAccessPointCell(record.handleTimeoutType),
          rxFilter: stringifyAccessPointCell(record.rxFilter),
          handleDataStatus: stringifyAccessPointCell(record.handleDataStatus),
          queueLength: stringifyAccessPointCell(record.queueLength),
          dataType: stringifyAccessPointCell(record.dataType),
          dataConstraints: stringifyAccessPointCell(record.dataConstraints),
          addressingMethod: stringifyAccessPointCell(record.addressingMethod),
          useQueuedCommunication: stringifyAccessPointCell(record.useQueuedCommunication),
          measurementCalibration: stringifyAccessPointCell(record.measurementCalibration),
          handleInvalid: stringifyAccessPointCell(record.handleInvalid)
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseInterfaceMemberDetails(value: string | undefined): CommunicationSpecDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : {};
      const semanticPath = stringifyAccessPointCell(record.semanticPath);
      const label = stringifyAccessPointCell(record.label);
      return [
        {
          index: String(index + 1),
          dataElement: semanticPath !== "-" ? semanticPath : label,
          comSpec: stringifyAccessPointCell(record.kind),
          comSpecDirection: parseCommunicationSpecDirection(record.kind, record.kind),
          initValue: stringifyAccessPointCell(metadata["INITIAL-VALUE"] ?? metadata["INIT-VALUE"]),
          initValueType: stringifyAccessPointCell(metadata["INITIAL-VALUE-TYPE"] ?? metadata["INIT-VALUE-TYPE"]),
          usesTxAcknowledge: "-",
          transmissionAcknowledgeTimeout: "-",
          usesEndToEndProtection: "-",
          handleOutOfRange: "-",
          transmissionMode: "-",
          dataUpdatePeriod: "-",
          minimumSendInterval: "-",
          aliveTimeout: "-",
          enableUpdate: "-",
          handleNeverReceived: "-",
          usesEndToEndProtectionErrorHandling: "-",
          timeoutSubstitutionValue: "-",
          timeoutSubstitutionValueType: "-",
          handleTimeoutType: "-",
          rxFilter: "-",
          handleDataStatus: "-",
          queueLength: "-",
          dataType: stringifyAccessPointCell(metadata.TYPE),
          dataConstraints: stringifyAccessPointCell(metadata["DATA-CONSTRAINTS"]),
          addressingMethod: stringifyAccessPointCell(metadata["SW-ADDR-METHOD-REF"]),
          useQueuedCommunication: stringifyAccessPointCell(metadata["IS-QUEUED"]),
          measurementCalibration: stringifyAccessPointCell(metadata["SW-CALIBRATION-ACCESS"]),
          handleInvalid: stringifyAccessPointCell(metadata["HANDLE-INVALID"])
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseCommunicationSpecDirection(direction: unknown, comSpec: unknown) {
  const rawDirection = stringifyAccessPointCell(direction).toLowerCase();
  if (
    rawDirection === "sender" ||
    rawDirection === "receiver" ||
    rawDirection === "client" ||
    rawDirection === "server" ||
    rawDirection === "parameter" ||
    rawDirection === "mode" ||
    rawDirection === "trigger" ||
    rawDirection === "nvdata"
  ) {
    return rawDirection === "nvdata" ? "nvData" : rawDirection;
  }

  const rawComSpec = stringifyAccessPointCell(comSpec).toLowerCase();
  if (rawComSpec.includes("receiver")) {
    return "receiver";
  }
  if (rawComSpec.includes("sender")) {
    return "sender";
  }
  if (rawComSpec.includes("client")) {
    return "client";
  }
  if (rawComSpec.includes("server")) {
    return "server";
  }
  if (rawComSpec.includes("parameter")) {
    return "parameter";
  }
  if (rawComSpec.includes("nvdata") || rawComSpec.includes("nv data")) {
    return "nvData";
  }
  if (rawComSpec.includes("mode")) {
    return "mode";
  }
  if (rawComSpec.includes("trigger")) {
    return "trigger";
  }
  return "unknown";
}

function formatMeasurementCalibrationOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "notaccessible" || normalized === "none" || normalized === "false") {
    return "Not Accessible";
  }

  if (normalized === "readwrite" || (normalized.includes("read") && normalized.includes("write"))) {
    return "ReadWrite";
  }
  if (normalized === "write" || normalized === "writeonly") {
    return "Write";
  }
  return "Read";
}

function formatHandleInvalidOption(value: string) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  if (!normalizedValue || normalizedValue === "none" || normalizedValue === "false" || normalizedValue === "noaction") {
    return "None";
  }
  if (normalizedValue.startsWith("replace")) {
    return "Replace";
  }
  if (normalizedValue.startsWith("keep")) {
    return "Keep";
  }
  return "None";
}

const initValueTypeOptions = [
  "None",
  "Numerical",
  "Textual",
  "Boolean",
  "Constant Reference",
  "Array",
  "Record",
  "Application Value",
  "Not Available"
];

const handleOutOfRangeOptions = ["None", "Ignore", "Saturate", "Wrap", "Replace", "Invalidate"];

const transmissionModeOptions = [
  "None",
  "Cyclic",
  "On Change",
  "On Write",
  "Triggered",
  "Triggered On Change",
  "Triggered On Change Without Repetition",
  "Triggered Without Repetition"
];

const rxFilterOptions = [
  "None",
  "ALWAYS",
  "NEVER",
  "MASKED-NEW-DIFFERS-X",
  "MASKED-NEW-DIFFERS-MASKED-OLD",
  "MASKED-NEW-EQUALS-X",
  "MASKED-NEW-EQUALS-MASKED-OLD",
  "NEW-IS-WITHIN",
  "NEW-IS-OUTSIDE",
  "ONE-EVERY-N"
];

function getRxFilterOptions(value: string) {
  const option = formatRxFilterOption(value);
  return rxFilterOptions.includes(option) ? rxFilterOptions : [...rxFilterOptions, option];
}

function formatRxFilterOption(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return "None";
  }

  const labeledMatch = trimmed.match(/(?:^|,\s*)Data Filter Type:\s*([^,]+)/i);
  return (labeledMatch?.[1] ?? trimmed).trim();
}

function formatInitValueTypeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("numerical")) {
    return "Numerical";
  }
  if (normalized.includes("text")) {
    return "Textual";
  }
  if (normalized.includes("boolean")) {
    return "Boolean";
  }
  if (normalized.includes("constant")) {
    return "Constant Reference";
  }
  if (normalized.includes("array")) {
    return "Array";
  }
  if (normalized.includes("record")) {
    return "Record";
  }
  if (normalized.includes("application")) {
    return "Application Value";
  }
  if (normalized.includes("notavailable")) {
    return "Not Available";
  }
  return "None";
}

const INIT_VALUE_PREVIEW_LENGTH = 100;

function ModelInitValueDisplay(props: { value: string; type: string }) {
  const { value, type } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = shouldTruncateInitValue(value, type);
  const displayValue = formatInitValueDisplay(value, type, isExpanded);
  const isMultiline = displayValue.includes("\n");

  return (
    <span className="model-init-value-display" title={value}>
      <span className={isMultiline ? "model-init-value-text is-multiline" : "model-init-value-text"}>
        {displayValue}
      </span>
      {canExpand && (
        <button
          type="button"
          className="model-init-value-toggle"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}

function formatInitValueDisplay(value: string, type: string, expanded = false) {
  if (expanded) {
    return formatStructuredInitValue(value, type);
  }

  if (!shouldTruncateInitValue(value, type)) {
    return formatStructuredInitValue(value, type);
  }

  return `${value.slice(0, INIT_VALUE_PREVIEW_LENGTH)}...`;
}

function shouldTruncateInitValue(value: string, type: string) {
  const normalizedType = normalizeAutosarEnumToken(type);
  const shouldTruncate =
    normalizedType.includes("constant") ||
    normalizedType.includes("array") ||
    normalizedType.includes("record");

  return shouldTruncate && value.length > INIT_VALUE_PREVIEW_LENGTH;
}

function formatStructuredInitValue(value: string, type: string) {
  const normalizedType = normalizeAutosarEnumToken(type);
  const shouldFormat = normalizedType.includes("array") || normalizedType.includes("record");
  if (!shouldFormat || value === "-" || value.length === 0) {
    return value;
  }

  return prettyPrintCompositeValue(value);
}

function prettyPrintCompositeValue(value: string) {
  let depth = 0;
  let result = "";
  let pendingSpace = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{" || char === "[") {
      result = trimTrailingSpaces(result);
      if (result.endsWith(":")) {
        result += " ";
      }
      result += char;
      depth += 1;
      result += `\n${"  ".repeat(depth)}`;
      pendingSpace = false;
      continue;
    }
    if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      result = trimTrailingSpaces(result);
      result += `\n${"  ".repeat(depth)}${char}`;
      pendingSpace = false;
      continue;
    }
    if (char === ",") {
      result = trimTrailingSpaces(result) + ",";
      result += `\n${"  ".repeat(depth)}`;
      pendingSpace = false;
      continue;
    }
    if (/\s/.test(char)) {
      pendingSpace = result.length > 0 && !result.endsWith("\n");
      continue;
    }

    if (pendingSpace) {
      result += " ";
      pendingSpace = false;
    }
    result += char;
  }

  return trimTrailingSpaces(result);
}

function trimTrailingSpaces(value: string) {
  return value.replace(/[ \t]+$/g, "");
}

function formatHandleOutOfRangeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "false" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("ignore")) {
    return "Ignore";
  }
  if (normalized.includes("saturate")) {
    return "Saturate";
  }
  if (normalized.includes("wrap")) {
    return "Wrap";
  }
  if (normalized.includes("replace")) {
    return "Replace";
  }
  if (normalized.includes("invalidate") || normalized.includes("invalid")) {
    return "Invalidate";
  }
  return "None";
}

function formatTransmissionModeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "false" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("triggeredonchangewithoutrepetition")) {
    return "Triggered On Change Without Repetition";
  }
  if (normalized.includes("triggeredwithoutrepetition")) {
    return "Triggered Without Repetition";
  }
  if (normalized.includes("triggeredonchange")) {
    return "Triggered On Change";
  }
  if (normalized.includes("triggered")) {
    return "Triggered";
  }
  if (normalized.includes("onchange")) {
    return "On Change";
  }
  if (normalized.includes("onwrite")) {
    return "On Write";
  }
  if (normalized.includes("cyclic")) {
    return "Cyclic";
  }
  return "None";
}

function normalizeAutosarEnumToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type ServiceNeedDetailField = {
  tag?: string;
  label: string;
  value: string;
  kind: "checkbox" | "dropdown";
  checked: boolean;
};

type ServiceNeedDisplayDetail = {
  label: string;
  value: string;
  kind: "checkbox" | "checkboxDropdown" | "dropdown" | "number" | "text";
  checked?: boolean;
  options?: string[];
};

interface NvmAssignedDataDetail {
  role: "ramBlock" | "defaultValue";
  value: string;
}

interface ServiceAssignedPortDetail {
  portPrototype: string;
  portPrototypeRef?: string;
  portInterface: string;
  portInterfaceRef?: string;
  assignedRole: string;
}

interface ServiceAssignedDataDetail {
  assignedRole: string;
  value: string;
  portPrototype: string;
  portPrototypeRef?: string;
  portInterface: string;
  portInterfaceRef?: string;
  dataElementPrototype: string;
  dataElementPrototypeRef?: string;
}

const nvBlockNeedsDetailOrder: Array<{
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
}> = [
  { label: "Name", kind: "text" },
  { label: "Service Need", kind: "text" },
  { label: "Category", kind: "text" },
  { label: "Ram Block Status Control", tag: "RAM-BLOCK-STATUS-CONTROL", kind: "dropdown" },
  { label: "Reliability", tag: "RELIABILITY", kind: "dropdown" },
  { label: "Writing Priority", tag: "WRITING-PRIORITY", kind: "dropdown" },
  { label: "Number of Datasets", tag: "N-DATA-SETS", aliases: ["N Data Sets"], kind: "number", defaultValue: "0" },
  { label: "Number of ROM Block", tag: "N-ROM-BLOCKS", aliases: ["N Rom Blocks"], kind: "number", defaultValue: "0" },
  { label: "Calc Ram Block Crc", tag: "CALC-RAM-BLOCK-CRC", kind: "checkbox", defaultValue: "false" },
  { label: "Readonly", tag: "READONLY", kind: "checkbox", defaultValue: "false" },
  {
    label: "Resistant To Changed Sw",
    tag: "RESISTANT-TO-CHANGED-SW",
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Restore At Start", tag: "RESTORE-AT-START", kind: "checkbox", defaultValue: "false" },
  { label: "Store At Shutdown", tag: "STORE-AT-SHUTDOWN", kind: "checkbox", defaultValue: "false" },
  { label: "Use Crc Comp Mechanism", tag: "USE-CRC-COMP-MECHANISM", kind: "checkbox", defaultValue: "false" },
  { label: "Check Static Block ID", tag: "CHECK-STATIC-BLOCK-ID", kind: "checkbox", defaultValue: "false" },
  { label: "Write Verification", tag: "WRITE-VERIFICATION", kind: "checkbox", defaultValue: "false" },
  { label: "Write only once", tag: "WRITE-ONLY-ONCE", kind: "checkbox", defaultValue: "false" },
  {
    label: "Use Auto Validation at Shutdown",
    tag: "USE-AUTO-VALIDATION-AT-SHUT-DOWN",
    aliases: ["Use Auto Validation At Shut Down"],
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Store Emergency", tag: "STORE-EMERGENCY", kind: "checkbox", defaultValue: "false" },
  { label: "Store Immediate", tag: "STORE-IMMEDIATE", kind: "checkbox", defaultValue: "false" },
  { label: "Store Cyclic", tag: "STORE-CYCLIC", kind: "checkbox", defaultValue: "false" },
  { label: "Cyclic Writing Period", tag: "CYCLIC-WRITING-PERIOD", kind: "number", defaultValue: "0 sec" }
];

type ServiceNeedDetailDefinition = {
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
  options?: string[];
  formatter?: (value: string) => string;
};

const serviceNeedDetailOrders: Record<string, ServiceNeedDetailDefinition[]> = {
  bswmgrneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  commgruserneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Max Comm Mode", tag: "MAX-COMM-MODE", kind: "dropdown" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  cryptoserviceneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    {
      label: "Max Key Length",
      tag: "MAX-KEY-LENGTH",
      kind: "number",
      defaultValue: "0 bytes",
      formatter: formatBytesValue
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticcommunicationmanagerneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    {
      label: "Service Request Callback Type",
      tag: "SERVICE-REQUEST-CALLBACK-TYPE",
      kind: "checkboxDropdown",
      options: ["Manufacturer", "Supplier"]
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticenableconditionneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    { label: "DID Number", tag: "DID-NUMBER", aliases: ["Did Number"], kind: "number", defaultValue: "0" },
    {
      label: "Processing Style",
      tag: "PROCESSING-STYLE",
      kind: "checkboxDropdown",
      options: ["Asynch", "Synch", "Asynch with Error"]
    },
    { label: "Port Assignment", kind: "text" },
    { label: "Fixed Length", tag: "FIXED-LENGTH", kind: "checkbox", defaultValue: "false" }
  ]
};

function getGenericServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  const rows: ServiceNeedDisplayDetail[] = [
    { label: "Name", value: itemLabel ?? "-", kind: "text" },
    { label: "Service Need", value: metadata["SERVICE-NEED"] ?? "-", kind: "text" },
    { label: "Category", value: metadata.CATEGORY ?? "-", kind: "text" }
  ];

  if (details.length === 0) {
    return [...rows, { label: "Service Need Details", value: "-", kind: "text" }];
  }

  return [
    ...rows,
    ...details.map((detail) => ({
      label: detail.label,
      value: detail.value,
      kind: detail.kind,
      checked: detail.checked
    }))
  ];
}

function getServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  if (serviceType === "nvblockneeds") {
    return getNvBlockNeedsDetailRows(itemLabel, metadata, details);
  }

  const definitions = serviceNeedDetailOrders[serviceType];
  if (!definitions) {
    return getGenericServiceNeedDetailRows(itemLabel, metadata, details);
  }

  return definitions.map((definition) => buildServiceNeedDetailRow(definition, itemLabel, metadata, details));
}

function buildServiceNeedDetailRow(
  definition: ServiceNeedDetailDefinition,
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail {
  if (definition.label === "Name") {
    return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
  }
  if (definition.label === "Service Need") {
    return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
  }
  if (definition.label === "Category") {
    return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
  }
  if (definition.label === "Port Assignment") {
    return {
      label: definition.label,
      value: formatAssignedPortPrototypeColumn(metadata["ASSIGNED-PORT-DETAILS"], metadata["ASSIGNED-PORTS"]),
      kind: definition.kind
    };
  }

  const detail = findServiceNeedDetail(details, definition);
  const rawValue = detail?.value;
  const fallback = definition.defaultValue ?? "-";
  const value = definition.formatter ? definition.formatter(rawValue ?? fallback) : rawValue || fallback;
  const checked =
    definition.kind === "checkbox"
      ? readBinaryServiceNeedDetailValue(value) === true
      : definition.kind === "checkboxDropdown"
        ? value !== "-" && readBinaryServiceNeedDetailValue(value) !== false
        : undefined;
  return {
    label: definition.label,
    value: definition.options ? normalizeServiceNeedOption(value, definition.options) : value,
    kind: definition.kind,
    checked,
    options: definition.options
  };
}

function getNvBlockNeedsDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  return nvBlockNeedsDetailOrder.map((definition) => {
    if (definition.label === "Name") {
      return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
    }
    if (definition.label === "Service Need") {
      return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
    }
    if (definition.label === "Category") {
      return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
    }

    const detail = findServiceNeedDetail(details, definition);
    const value = formatNvBlockNeedDetailValue(definition, detail?.value);
    const checked = definition.kind === "checkbox" ? readBinaryServiceNeedDetailValue(value) === true : undefined;
    return {
      label: definition.label,
      value,
      kind: definition.kind,
      checked
    };
  });
}

function findServiceNeedDetail(
  details: ServiceNeedDetailField[],
  definition: ServiceNeedDetailDefinition
) {
  const expectedKeys = [definition.tag, definition.label, ...(definition.aliases ?? [])]
    .filter((entry): entry is string => Boolean(entry))
    .map(normalizeAutosarEnumToken);
  return details.find((detail) => {
    const keys = [detail.tag, detail.label].filter((entry): entry is string => Boolean(entry)).map(normalizeAutosarEnumToken);
    return keys.some((key) => expectedKeys.includes(key));
  });
}

function formatBytesValue(value: string) {
  if (!value || value === "-") {
    return "0 bytes";
  }
  return /\bbytes?\b/i.test(value) ? value : `${value} bytes`;
}

function normalizeServiceNeedOption(value: string, options: string[]) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  return options.find((option) => normalizeAutosarEnumToken(option) === normalizedValue) ?? value;
}

function getServiceNeedSelectOptions(value: string, options: string[] | undefined) {
  const selectOptions = options && options.length > 0 ? options : [value];
  return selectOptions.includes(value) ? selectOptions : [value, ...selectOptions];
}

function formatNvBlockNeedDetailValue(
  definition: (typeof nvBlockNeedsDetailOrder)[number],
  value: string | undefined
) {
  const fallback = definition.defaultValue ?? "-";
  if (!value || value === "-") {
    return fallback;
  }

  if (definition.tag === "CYCLIC-WRITING-PERIOD") {
    return formatNvBlockCyclicWritingPeriod(value);
  }

  return value;
}

function formatNvBlockCyclicWritingPeriod(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }
  if (numericValue === 0) {
    return "0 sec";
  }
  if (Math.abs(numericValue) >= 1000 && Number.isInteger(numericValue) && numericValue % 1000 === 0) {
    return `${formatNumber(numericValue / 1000)} sec`;
  }
  if (Math.abs(numericValue) >= 1) {
    return `${formatNumber(numericValue)} msec`;
  }
  return formatTimeInterval(value);
}

function parseNvmAssignedDataDetails(metadata: Record<string, string>): NvmAssignedDataDetail[] {
  const assignedData = parseServiceAssignedDataDetails(metadata["ASSIGNED-DATA-DETAILS"]);
  return [
    {
      role: "ramBlock",
      value: findAssignedDataValue(assignedData, "ramblock") ?? metadata["ASSIGNED-DATA-RAM-BLOCK"] ?? "-"
    },
    {
      role: "defaultValue",
      value: findAssignedDataValue(assignedData, "defaultvalue") ?? metadata["ASSIGNED-DATA-DEFAULT-VALUE"] ?? "-"
    }
  ];
}

function parseServiceAssignedDataDetails(value: string | undefined): ServiceAssignedDataDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      const assignedRole = stringifyAccessPointCell(record.role);
      const dataElementPrototype = stringifyAccessPointCell(record.dataElementPrototype ?? record.value);
      return [
        {
          assignedRole,
          value: stringifyAccessPointCell(record.value),
          portPrototype: stringifyAccessPointCell(record.portPrototype),
          portPrototypeRef: stringifyOptionalCell(record.portPrototypeRef),
          portInterface: stringifyAccessPointCell(record.portInterface),
          portInterfaceRef: stringifyOptionalCell(record.portInterfaceRef),
          dataElementPrototype,
          dataElementPrototypeRef: stringifyOptionalCell(record.dataElementPrototypeRef)
        }
      ];
    });
  } catch {
    return [];
  }
}

function findAssignedDataValue(assignments: ServiceAssignedDataDetail[], normalizedRole: string) {
  return assignments.find((assignment) => normalizeAutosarEnumToken(assignment.assignedRole) === normalizedRole)?.value;
}

function formatAssignedPortPrototypeColumn(detailsValue: string | undefined, fallbackSummary: string | undefined) {
  const details = parseServiceAssignedPortDetails(detailsValue);
  if (details.length > 0) {
    return details.map((detail) => detail.portPrototype).filter((value) => value !== "-").join(", ") || "-";
  }

  if (!fallbackSummary) {
    return "-";
  }

  const ports = fallbackSummary.split(",").flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
    return value ? [value] : [];
  });
  return ports.length > 0 ? ports.join(", ") : "-";
}

function parseServiceAssignedPortDetails(value: string | undefined): ServiceAssignedPortDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          portPrototype: stringifyAccessPointCell(record.portPrototype),
          portPrototypeRef: stringifyOptionalCell(record.portPrototypeRef),
          portInterface: stringifyAccessPointCell(record.portInterface),
          portInterfaceRef: stringifyOptionalCell(record.portInterfaceRef),
          assignedRole: stringifyAccessPointCell(record.assignedRole)
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseServiceNeedDetailFields(
  fieldsJson: string | undefined,
  fallbackSummary: string | undefined
): ServiceNeedDetailField[] {
  const parsedFields = parseStructuredServiceNeedDetailFields(fieldsJson);
  const fields =
    parsedFields.length > 0
      ? parsedFields
      : parseServiceNeedDetailSummary(fallbackSummary).map((detail) => ({
          label: detail.label,
          value: detail.value
        }));

  return fields.map((detail) => {
    const checked = readBinaryServiceNeedDetailValue(detail.value);
    return {
      tag: detail.tag,
      label: detail.label,
      value: detail.value,
      kind: checked === undefined ? "dropdown" : "checkbox",
      checked: checked === true
    };
  });
}

function parseStructuredServiceNeedDetailFields(value: string | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const record = entry as Record<string, unknown>;
      const tag = typeof record.tag === "string" ? record.tag : undefined;
      const label = typeof record.label === "string" ? record.label : undefined;
      const detailValue = typeof record.value === "string" ? record.value : undefined;
      return label && detailValue !== undefined ? [{ tag, label, value: detailValue }] : [];
    });
  } catch {
    return [];
  }
}

function parseServiceNeedDetailSummary(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value.split(/,\s+(?=[A-Z][A-Za-z0-9 ]+:\s*)/).flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      return [];
    }
    const label = entry.slice(0, separatorIndex).trim();
    const detailValue = entry.slice(separatorIndex + 1).trim();
    return label && detailValue ? [{ label, value: detailValue }] : [];
  });
}

function readBinaryServiceNeedDetailValue(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return undefined;
}

function parseRunnableActivationReasonDetails(value: string | undefined): RunnableActivationReasonDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          bit: stringifyAccessPointCell(record.bit),
          name: stringifyAccessPointCell(record.name),
          symbol: stringifyAccessPointCell(record.symbol)
        }
      ];
    });
  } catch {
    return [];
  }
}

function parseRunnableTriggerEventDetails(value: string | undefined): RunnableTriggerEventDetail[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      return [
        {
          trigger: stringifyAccessPointCell(record.trigger),
          type: stringifyAccessPointCell(record.type),
          disabledInModes: stringifyAccessPointCell(record.disabledInModes),
          activationReason: stringifyAccessPointCell(record.activationReason),
          name: stringifyAccessPointCell(record.name)
        }
      ];
    });
  } catch {
    return [];
  }
}

function ModelListSection(props: { title: string; items: string[] }) {
  const { title, items } = props;
  return (
    <section className="model-list-section">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="model-list-empty">No items discovered.</div>
      )}
    </section>
  );
}

function getSectionsForTab(kind: ModelWorkspaceTab["kind"]): SwcInspectorSectionId[] {
  switch (kind) {
    case "runnables":
      return ["runnables"];
    case "parameters":
      return ["calibrationVariables", "interfaceParameters"];
    case "interRunnableVariables":
      return ["interRunnableVariables"];
    case "perInstanceMemory":
    case "perInstanceMemoryItem":
    case "memory":
      return ["perInstanceMemory"];
    case "events":
    case "event":
      return ["interfaceTriggers", "interfaceModeGroups"];
    case "serviceDependencies":
    case "serviceDependencyGroup":
    case "serviceDependency":
      return ["serviceDependencies"];
    case "exclusiveAreas":
      return [];
    default:
      return [
        "runnables",
        "calibrationVariables",
        "interRunnableVariables",
        "perInstanceMemory",
        "serviceDependencies",
        "interfaceDataElements",
        "interfaceOperations",
        "interfaceApplicationErrors",
        "interfaceParameters",
        "interfaceModeGroups",
        "interfaceTriggers"
      ];
  }
}

function getSemanticColumns(kind: ModelWorkspaceTab["kind"]) {
  if (kind === "parameters") {
    return [
      { key: "section", label: "Source" },
      { key: "label", label: "Parameter" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" },
      { key: "TYPE", label: "Type" }
    ];
  }

  if (kind === "events" || kind === "event") {
    return [
      { key: "section", label: "Source" },
      { key: "label", label: "Event" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" }
    ];
  }

  if (kind === "serviceDependencies" || kind === "serviceDependencyGroup" || kind === "serviceDependency") {
    return [
      { key: "label", label: "Name" },
      { key: "SERVICE-TYPE", label: "Service Type" },
      { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
    ];
  }

  return [
    { key: "section", label: "Section" },
    { key: "label", label: "Name" },
    { key: "TYPE", label: "Type" },
    { key: "SYMBOL", label: "Symbol" },
    { key: "PERIOD", label: "Period" }
  ];
}

function getEmptyLabel(kind: ModelWorkspaceTab["kind"]) {
  switch (kind) {
    case "events":
      return "No events discovered.";
    case "parameters":
      return "No parameters discovered.";
    case "perInstanceMemory":
      return "No per-instance memory discovered.";
    case "exclusiveAreas":
      return "No exclusive areas discovered.";
    case "serviceDependencies":
    case "serviceDependencyGroup":
      return "No service needs discovered.";
    default:
      return "No semantic details discovered.";
  }
}

function findInspectorItem(
  inspector: SwcInspectorData | undefined,
  sectionId: SwcInspectorSectionId,
  itemId: string | undefined
) {
  return inspector?.sections.find((section) => section.id === sectionId)?.items.find((item) => item.id === itemId);
}

function findInspectorItemInSections(
  inspector: SwcInspectorData | undefined,
  sectionIds: SwcInspectorSectionId[],
  itemId: string | undefined
) {
  if (!itemId) {
    return undefined;
  }

  for (const sectionId of sectionIds) {
    const item = findInspectorItem(inspector, sectionId, itemId);
    if (item) {
      return item;
    }
  }

  return undefined;
}

function collectInspectorItems(
  inspector: SwcInspectorData | undefined,
  sectionIds: SwcInspectorSectionId[]
): InspectorTableItem[] {
  return sectionIds.flatMap((sectionId) => {
    const section = inspector?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({
      sectionId,
      sectionLabel: section?.label ?? sectionId,
      item
    }));
  });
}

function inspectorItemRows(item: SwcInspectorItem | undefined, sectionLabel?: string): Array<[string, string]> {
  if (!item) {
    return [["Name", "-"]];
  }

  return [
    ["Name", item.label],
    ...(sectionLabel ? ([["Source", sectionLabel]] as Array<[string, string]>) : []),
    ...Object.entries(item.metadata ?? {}).map(([key, value]) => [key, value] as [string, string])
  ];
}

function readBooleanMetadata(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
}

function formatBooleanMetadata(value: string | undefined) {
  return readBooleanMetadata(value) === true ? "true" : "false";
}

function readEnabledMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "-" && normalized !== "false" && normalized !== "none" && normalized !== "no";
}

function readTransformationErrorHandlingMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "-" &&
    normalized !== "false" &&
    normalized !== "none" &&
    normalized !== "no" &&
    normalized !== "no-transformer-error-handling"
  );
}

function splitMetadataList(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function formatTimeInterval(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  if (seconds === 0 || Math.abs(seconds) >= 1) {
    return `${formatNumber(seconds)} sec`;
  }

  const milliseconds = seconds * 1000;
  if (Math.abs(milliseconds) >= 1) {
    return `${formatNumber(milliseconds)} msec`;
  }

  return `${formatNumber(seconds * 1_000_000)} usec`;
}

function formatOptionalMilliseconds(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  return `${formatNumber(seconds * 1000)} ms`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function ModelInspector(props: {
  inspector?: SwcInspectorData;
  selectedNode?: SwcGraphNode;
  selectedEdge?: SwcGraphResult["edges"][number];
}) {
  const { inspector, selectedNode, selectedEdge } = props;
  const [collapsedSections, setCollapsedSections] = useState<Record<string, true>>({});

  useEffect(() => {
    setCollapsedSections({});
  }, [inspector?.ownerId, inspector?.ownerLabel]);

  if (!inspector) {
    return (
      <div className="model-inspector-empty">
        {selectedEdge
          ? `Connector ${selectedEdge.label} does not expose SWC internals. Select an SWC or instance node to inspect its behavior.`
          : selectedNode
            ? `Node ${selectedNode.label} does not expose SWC internals. Select an SWC or SWC instance to inspect runnables and internal variables.`
            : "Select an SWC or instance node to inspect runnables, calibration variables, and internal memory."}
      </div>
    );
  }

  return (
    <div className="model-inspector">
      <div className="model-inspector-header">
        <div>
          <span className="panel-eyebrow">SWC Inspector</span>
          <strong>{inspector.ownerLabel}</strong>
        </div>
      </div>
      <div className="model-inspector-tree" role="tree" aria-label="SWC inspector">
        {inspector.sections.map((section) => (
          <div key={section.id} className="tree-group model-inspector-tree-group">
            <button
              type="button"
              className="tree-row tree-folder model-inspector-tree-row"
              onClick={() => {
                setCollapsedSections((current) => {
                  const next = { ...current };
                  if (next[section.id]) {
                    delete next[section.id];
                  } else {
                    next[section.id] = true;
                  }
                  return next;
                });
              }}
              aria-expanded={!collapsedSections[section.id]}
              role="treeitem"
            >
              <span className={`tree-caret ${collapsedSections[section.id] ? "collapsed" : "expanded"}`} />
              <span className="tree-label">{section.label}</span>
              <span className="model-inspector-count">{section.items.length}</span>
            </button>
            {!collapsedSections[section.id] &&
              (section.items.length > 0 ? (
                <div role="group">
                  <div className="model-inspector-section-table-shell" style={{ paddingLeft: "30px" }}>
                    <table className="model-inspector-section-table">
                      <thead>
                        <tr>
                          {getInspectorColumns(section).map((column) => (
                            <th key={column.key} scope="col">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item) => (
                          <tr key={item.id}>
                            {getInspectorColumns(section).map((column) => (
                              <td key={column.key}>{readInspectorCell(item, column.key)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div
                  className="tree-row tree-file model-inspector-tree-row model-inspector-empty-row"
                  role="treeitem"
                  style={{ paddingLeft: "30px" }}
                >
                  <span className="tree-label">No items discovered.</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AutosarFlowNode({ data }: NodeProps<FlowNode>) {
  const providedPorts = data.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  const requiredPorts = data.ports.filter((port) => port.direction === "required");
  const isPortCard = data.kind === "port";
  const leftRailWidth = getPortRailWidth(requiredPorts);
  const rightRailWidth = getPortRailWidth(providedPorts);

  return (
    <div className={`autosar-node autosar-node-${data.kind}`}>
      {isPortCard ? (
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
            side={data.ports[0]?.direction === "provided" ? "right" : "left"}
            highlightedPortId={data.highlightedPortId}
            onConnectionNavigate={data.onConnectionNavigate}
          />
        </div>
      ) : (
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
              {data.kind !== "port" && (
                <div className="autosar-node-badges">
                  <span className="autosar-node-badge">
                    <span className="autosar-family-glyph" aria-hidden="true">
                      {formatSwcKindGlyph(data.swcKind)}
                    </span>
                    {data.kind === "composition" ? "Composition" : formatSwcKindLabel(data.swcKind)}
                  </span>
                </div>
              )}
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
      )}
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
    return <div className="autosar-node-empty">{compact ? "" : ""}</div>;
  }

  return (
    <div className={`autosar-port-list ${compact ? "compact" : ""} side-${side}`}>
      {ports.map((port) => (
        <button
          key={port.id}
          type="button"
          className={`autosar-port autosar-port-${port.direction} side-${side} ${port.id === highlightedPortId ? "is-highlighted-target" : ""}`}
          onDoubleClick={(event) => {
            event.stopPropagation();
            const primaryConnection = portConnections?.[port.id]?.[0];
            if (primaryConnection) {
              onConnectionNavigate?.(primaryConnection.targetNodeId, primaryConnection.targetPortId);
            }
          }}
          style={
            railWidth && side !== "center"
              ? ({
                  ["--port-label-width" as string]: `${Math.max(116, railWidth - 54)}px`
                } as React.CSSProperties)
              : undefined
          }
        >
          <Handle
            id={port.id}
            type={side === "left" || side === "center" ? "target" : "source"}
            position={side === "right" ? Position.Right : Position.Left}
          />
          <span className="autosar-pin-line" aria-hidden="true" />
          <PortGlyph direction={port.direction} interfaceKind={port.interfaceKind} side={side} />
          <div className="autosar-port-text">
            <strong>{port.label}</strong>
            {(() => {
              const connections = portConnections?.[port.id];
              if (!connections || connections.length === 0) {
                return null;
              }

              return (
                <span className="autosar-port-connection-list">
                  {connections.map((connection, index) => (
                    <span
                      key={`${connection.componentName}:${connection.portName}:${index}`}
                      className={`autosar-port-connection-label ${port.id === highlightedPortId ? "is-highlighted-target" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onConnectionNavigate?.(connection.targetNodeId, connection.targetPortId);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onConnectionNavigate?.(connection.targetNodeId, connection.targetPortId);
                      }}
                    >
                      <span className="autosar-port-connection-component">
                        {connection.componentName}
                      </span>
                      <span className="autosar-port-connection-port">{connection.portName}</span>
                    </span>
                  ))}
                </span>
              );
            })()}
          </div>
          {(!compact || exposeBothHandles) && (
            <Handle
              id={port.id}
              type={side === "left" ? "source" : side === "right" ? "target" : "source"}
              position={side === "left" ? Position.Right : side === "right" ? Position.Left : Position.Right}
            />
          )}
        </button>
      ))}
    </div>
  );
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

const noopNodesChange: OnNodesChange = () => undefined;
const noopEdgesChange: OnEdgesChange = () => undefined;

function getPortRailWidth(ports: FlowNodeData["ports"]) {
  const longestLabelLength = ports.reduce((max, port) => Math.max(max, port.label.length), 0);
  const estimatedTextWidth = longestLabelLength * 8;
  return Math.max(170, Math.min(320, estimatedTextWidth + 54));
}

function getIsolatedRailWidth(
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

function getEstimatedFlowNodeWidth(node: FlowNode) {
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

function getEstimatedFlowNodeHeight(node: FlowNode) {
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

function getFocusedNodeBounds(
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

function getFocusedNodeZoom(
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

function resolveInitialSelection(
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

function makeGraphCacheKey(
  workspaceRevision: string | undefined,
  scope: SwcGraphScope,
  focusId: string,
  includeCompositionInternals: boolean
) {
  return `${workspaceRevision ?? "workspace"}:${scope}:${includeCompositionInternals ? "internals" : "surface"}:${focusId}`;
}

function requiresGraphData(kind: ModelWorkspaceTab["kind"]) {
  return kind === "ports" || kind === "port";
}

function resolveFallbackInspector(
  graphResult: SwcGraphResult | undefined,
  focusEntity: AutosarEntity | undefined
) {
  if (!graphResult) {
    return focusEntity?.inspector;
  }
  return graphResult.nodes.find((node) => node.inspector)?.inspector ?? focusEntity?.inspector;
}

function getInspectorColumns(section: SwcInspectorData["sections"][number]) {
  const preferredColumnsBySection: Record<string, Array<{ key: string; label: string }>> = {
    runnables: [
      { key: "label", label: "Runnable" },
      { key: "PERIOD", label: "Period (ms)" },
      { key: "SYMBOL", label: "Symbol" },
      { key: "MIN-START-INTERVAL", label: "Min Start Interval (ms)" },
      { key: "CONCURRENT", label: "Concurrent" }
    ],
    calibrationVariables: [
      { key: "label", label: "Calibration Variable" },
      { key: "INITIAL-VALUE", label: "Initial Value" },
      { key: "TYPE", label: "Type" }
    ],
    interRunnableVariables: [
      { key: "label", label: "Inter-runnable Variable" },
      { key: "TYPE", label: "Type" }
    ],
    perInstanceMemory: [
      { key: "label", label: "Name" },
      { key: "TYPE", label: "Data Type" },
      { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
      { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
    ],
    serviceDependencies: [
      { key: "label", label: "Name" },
      { key: "SERVICE-TYPE", label: "Service Type" },
      { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
    ],
    interfaceDataElements: [
      { key: "label", label: "Data Element" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" },
      { key: "TYPE", label: "Type" }
    ],
    interfaceOperations: [
      { key: "label", label: "Operation" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" },
      { key: "ARGUMENTS", label: "Arguments" },
      { key: "ERRORS", label: "Errors" }
    ],
    interfaceApplicationErrors: [
      { key: "label", label: "Application Error" },
      { key: "INTERFACE", label: "Interface" },
      { key: "ERROR-CODE", label: "Error Code" }
    ],
    interfaceParameters: [
      { key: "label", label: "Parameter" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" },
      { key: "TYPE", label: "Type" }
    ],
    interfaceModeGroups: [
      { key: "label", label: "Mode Group" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" }
    ],
    interfaceTriggers: [
      { key: "label", label: "Trigger" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" }
    ]
  };

  return preferredColumnsBySection[section.id] ?? [{ key: "label", label: "Name" }];
}

function readInspectorCell(
  item: SwcInspectorData["sections"][number]["items"][number],
  columnKey: string
) {
  if (columnKey === "label") {
    return item.label;
  }
  const rawValue = item.metadata?.[columnKey];
  if (!rawValue) {
    return "—";
  }
  if (columnKey === "PERIOD" || columnKey === "MIN-START-INTERVAL") {
    return formatMilliseconds(rawValue);
  }
  return rawValue;
}

function formatMilliseconds(rawValue: string) {
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return rawValue;
  }

  const milliseconds = numericValue * 1000;
  return Number.isInteger(milliseconds) ? `${milliseconds} ms` : `${milliseconds.toFixed(3)} ms`;
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
