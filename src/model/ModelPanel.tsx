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

interface ModelPanelProps {
  focusEntity?: AutosarEntity;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  activeWorkspaceTab?: ModelWorkspaceTab;
  onOpenFile: (filePath: string) => void | Promise<void>;
  onJumpToPath: (filePath: string, xmlPath?: string) => void | Promise<void>;
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
    | "port"
    | "runnable"
    | "event";
  focusEntityId: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  entityId?: string;
  sectionId?: SwcInspectorSectionId;
  itemId?: string;
  xmlPath?: string;
}

export function ModelPanel(props: ModelPanelProps) {
  const {
    focusEntity,
    preferredScope,
    preferredNodeId,
    activeWorkspaceTab,
    onOpenFile,
    onJumpToPath,
    onOpenWorkspaceTab
  } = props;
  const [graphScope, setGraphScope] = useState<SwcGraphScope>(
    preferredScope ?? (focusEntity?.type === "composition" ? "composition" : "swc")
  );
  const [graphResult, setGraphResult] = useState<SwcGraphResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [activeCompositionNodeId, setActiveCompositionNodeId] = useState<string | undefined>(preferredNodeId);
  const [activeCompositionPortId, setActiveCompositionPortId] = useState<string | undefined>(undefined);
  const reactFlowRef = useRef<{
    getNode: (id: string) => {
      positionAbsolute?: { x: number; y: number };
      width?: number;
      height?: number;
    } | undefined;
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => unknown;
  } | null>(null);

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
      setGraphResult(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    void window.autosarApi
      .buildGraph({
        scope: graphScope,
        focusId: focusEntity.semanticPath ?? focusEntity.id,
        depth: 1,
        includeCompositionInternals: graphScope === "composition" && Boolean(activeCompositionNodeId)
      })
      .then((graph) => {
        if (cancelled) {
          return;
        }
        setGraphResult(graph);
        setLoading(false);
        setSelectedNodeId(resolveInitialSelection(graph, activeCompositionNodeId, preferredNodeId));
        setSelectedEdgeId(undefined);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setGraphResult(undefined);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCompositionNodeId, focusEntity, graphScope, preferredNodeId]);

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
          onPortDoubleClick: onJumpToPath,
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
  }, [activeCompositionNodeId, activeCompositionPortId, graphResult, onJumpToPath, preferredNodeId]);

  const fitViewOptions = shouldIsolateCompositionNode
    ? { padding: 0.12, maxZoom: 0.95, minZoom: 0.35 }
    : { padding: 0.2, maxZoom: 1.1, minZoom: 0.35 };

  useEffect(() => {
    if (!reactFlowRef.current || !graphResult || graphResult.scope !== "composition" || !activeCompositionNodeId) {
      return;
    }

    const targetNodeExists = flowGraph.nodes.some((node) => node.id === activeCompositionNodeId);
    if (!targetNodeExists) {
      return;
    }

    const targetNode = reactFlowRef.current.getNode(activeCompositionNodeId);
    const targetPosition = targetNode?.positionAbsolute;
    if (!targetPosition) {
      return;
    }

    const targetWidth = targetNode?.width ?? 0;
    const targetHeight = targetNode?.height ?? 0;
    const centerX = targetPosition.x + targetWidth / 2;
    const centerY = targetPosition.y + targetHeight / 2;

    void reactFlowRef.current.setCenter(centerX, centerY, {
      zoom: shouldIsolateCompositionNode ? 0.72 : 0.82,
      duration: 220
    });
  }, [activeCompositionNodeId, flowGraph.nodes, graphResult, shouldIsolateCompositionNode]);

  const nodeTypes = useMemo(
    () => ({
      autosarNode: AutosarFlowNode
    }),
    []
  );
  const flowCanvasKey = graphResult ? `${graphResult.scope}:${graphResult.focusId}:${preferredNodeId ?? ""}` : "empty";

  async function handleNodeDoubleClick(_event: React.MouseEvent, node: Node) {
    const graphNode = graphNodes.find((entry) => entry.id === node.id);
    if (!graphNode) {
      return;
    }

    if (graphNode.kind === "port") {
      await onJumpToPath(graphNode.filePath, graphNode.xmlPath);
      return;
    }

    await onOpenFile(graphNode.filePath);
  }

  async function handleEdgeDoubleClick(_event: React.MouseEvent, edge: Edge) {
    const graphEdge = graphEdges.find((entry) => entry.id === edge.id);
    if (!graphEdge) {
      return;
    }

    await onJumpToPath(graphEdge.filePath, graphEdge.xmlPath);
  }

  const warnings = graphResult?.warnings ?? [];

  return (
    <div className="model-workbench">
      <div className="model-content">
        {!activeWorkspaceTab ? (
          <div className="empty-state">Select an SWC or composition from the AUTOSAR model.</div>
        ) : activeWorkspaceTab.kind === "graph" ? (
          <div className="model-canvas-shell">
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
                onNodeClick={(_event, node) => {
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(undefined);
                }}
                onEdgeClick={(_event, edge) => {
                  setSelectedEdgeId(edge.id);
                  setSelectedNodeId(undefined);
                }}
                onNodeDoubleClick={handleNodeDoubleClick}
                onEdgeDoubleClick={handleEdgeDoubleClick}
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
            onJumpToPath={onJumpToPath}
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
  onJumpToPath: (filePath: string, xmlPath?: string) => void | Promise<void>;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const {
    tab,
    focusEntity,
    graphResult,
    inspector,
    selectedNode,
    selectedEdge,
    onJumpToPath,
    onOpenWorkspaceTab
  } = props;
  const semanticInspector = inspector ?? focusEntity?.inspector;
  const ports = graphResult?.nodes.find((node) => node.id === focusEntity?.id)?.ports ?? graphResult?.nodes[0]?.ports ?? [];

  if (!focusEntity) {
    return <div className="empty-state">Select an AUTOSAR model entity.</div>;
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
      <ModelTableSurface
        title={tab.title}
        emptyLabel="No ports discovered."
        columns={[
          { key: "label", label: "Port" },
          { key: "direction", label: "Direction" },
          { key: "interfaceKind", label: "Interface" },
          { key: "interfaceRef", label: "Interface Ref" }
        ]}
        rows={ports.map((port) => ({
          id: port.id,
          label: port.label,
          direction: port.direction,
          interfaceKind: port.interfaceKind ?? "unknown",
          interfaceRef: port.interfaceRef ?? "-",
          filePath: port.filePath,
          xmlPath: port.xmlPath
        }))}
        onJumpToPath={onJumpToPath}
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
        onJumpToPath={onJumpToPath}
      />
    );
  }

  if (tab.kind === "runnable") {
    const runnable = findInspectorItem(semanticInspector, "runnables", tab.itemId);
    return (
      <ModelRunnableSurface
        title={tab.title}
        runnable={runnable}
        filePath={focusEntity.filePath}
        xmlPath={runnable?.xmlPath ?? tab.xmlPath}
        onJumpToPath={onJumpToPath}
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
      onJumpToPath={onJumpToPath}
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

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      {runnables.length > 0 ? (
        <div className="model-semantic-table-shell">
          <table className="model-inspector-section-table model-semantic-table model-clickable-table">
            <thead>
              <tr>
                <th scope="col">SWC name</th>
                <th scope="col">Runnable Name</th>
                <th scope="col">Runnable Symbol</th>
                <th scope="col">Period</th>
              </tr>
            </thead>
            <tbody>
              {runnables.map((runnable) => (
                <tr
                  key={runnable.id}
                  tabIndex={0}
                  role="button"
                  onClick={() =>
                    onOpenWorkspaceTab?.({
                      id: `${focusEntityId}:runnable:${runnable.id}`,
                      title: `Runnable: ${runnable.label}`,
                      kind: "runnable",
                      focusEntityId,
                      sectionId: "runnables",
                      itemId: runnable.id,
                      xmlPath: runnable.xmlPath
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenWorkspaceTab?.({
                        id: `${focusEntityId}:runnable:${runnable.id}`,
                        title: `Runnable: ${runnable.label}`,
                        kind: "runnable",
                        focusEntityId,
                        sectionId: "runnables",
                        itemId: runnable.id,
                        xmlPath: runnable.xmlPath
                      });
                    }
                  }}
                >
                  <td>{swcName}</td>
                  <td>{runnable.label}</td>
                  <td>{runnable.metadata?.SYMBOL ?? "-"}</td>
                  <td>{formatOptionalMilliseconds(runnable.metadata?.PERIOD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No runnables discovered.</div>
      )}
    </div>
  );
}

function ModelTableSurface(props: {
  title: string;
  emptyLabel: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | undefined>>;
  onJumpToPath?: (filePath: string, xmlPath?: string) => void | Promise<void>;
}) {
  const { title, emptyLabel, columns, rows, onJumpToPath } = props;
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
                {onJumpToPath && <th scope="col">Source</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id ?? JSON.stringify(row)}>
                  {columns.map((column) => (
                    <td key={column.key}>{row[column.key] || "-"}</td>
                  ))}
                  {onJumpToPath && (
                    <td>
                      {row.filePath ? (
                        <button
                          type="button"
                          className="model-source-button"
                          onClick={() => void onJumpToPath(row.filePath!, row.xmlPath)}
                        >
                          Open
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
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
  onJumpToPath: (filePath: string, xmlPath?: string) => void | Promise<void>;
}) {
  const { title, rows, filePath, xmlPath, onJumpToPath } = props;
  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
        {filePath && (
          <button type="button" onClick={() => void onJumpToPath(filePath, xmlPath)}>
            Open Source
          </button>
        )}
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

function ModelRunnableSurface(props: {
  title: string;
  runnable?: SwcInspectorItem;
  filePath?: string;
  xmlPath?: string;
  onJumpToPath: (filePath: string, xmlPath?: string) => void | Promise<void>;
}) {
  const { title, runnable, filePath, xmlPath, onJumpToPath } = props;
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
        {filePath && (
          <button type="button" onClick={() => void onJumpToPath(filePath, xmlPath)}>
            Open Source
          </button>
        )}
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
  onJumpToPath: (filePath: string, xmlPath?: string) => void | Promise<void>;
}) {
  const { title, port, filePath, xmlPath, onJumpToPath } = props;
  const argumentValues = parsePortDefinedArgumentValues(port?.metadata?.["PORT-DEFINED-ARGUMENT-VALUES"]);
  const communicationSpecs = parseCommunicationSpecDetails(port?.metadata?.["COMMUNICATION-SPEC-DETAILS"]);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
        {filePath && (
          <button type="button" onClick={() => void onJumpToPath(filePath, xmlPath)}>
            Open Source
          </button>
        )}
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
            <span>Direction</span>
            <strong className="model-port-direction-options">
              <label>
                <input type="checkbox" checked={port?.direction === "provided"} disabled readOnly />
                Sender
              </label>
              <label>
                <input type="checkbox" checked={port?.direction === "required"} disabled readOnly />
                Receiver
              </label>
              <label>
                <input type="checkbox" checked={port?.direction === "provided-required"} disabled readOnly />
                Sender/Receiver
              </label>
            </strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{port?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>

        <ModelPortApiOptionsSection port={port} argumentValues={argumentValues} />
        <ModelCommunicationSpecsSection rows={communicationSpecs} />
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
  initValue: string;
  initValueType: string;
  usesTxAcknowledge: string;
  usesEndToEndProtection: string;
  handleOutOfRange: string;
  transmissionMode: string;
  dataUpdatePeriod: string;
  minimumSendInterval: string;
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
          </div>
          <ModelPortDefinedArgumentTable rows={argumentValues} />
        </>
      )}
    </section>
  );
}

function ModelCommunicationSpecsSection(props: { rows: CommunicationSpecDetail[] }) {
  const { rows } = props;
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
        <span>Communication Specs</span>
        <span className="model-list-section-count">{rows.length}</span>
      </button>
      {isExpanded && <ModelCommunicationSpecsTable rows={rows} embedded />}
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

function ModelCommunicationSpecsTable(props: { rows: CommunicationSpecDetail[]; embedded?: boolean }) {
  const { rows, embedded } = props;
  return (
    <section className={embedded ? "model-port-comspec-table-section" : "model-list-section model-port-comspec-section"}>
      {!embedded && <h3>Communication Specs</h3>}
      {rows.length > 0 ? (
        <div className="model-runnable-table-scroll">
          <table className="model-runnable-table">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>Index</th>
                <th>Data element</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ModelCommunicationSpecRow key={`${row.index}:${row.dataElement}:${row.comSpec}:${row.initValue}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="model-list-empty">No communication specs discovered.</div>
      )}
    </section>
  );
}

function ModelCommunicationSpecRow(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr className="model-expandable-table-row">
        <td title={row.index}>{row.index}</td>
        <td title={row.dataElement}>
          <button
            type="button"
            className="model-inline-expand-button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            <span className="model-list-section-chevron" aria-hidden="true" />
            <span>{formatReferenceShortName(row.dataElement)}</span>
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="model-communication-spec-detail-row">
          <td colSpan={2}>
            <ModelCommunicationSpecDetails row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function ModelCommunicationSpecDetails(props: { row: CommunicationSpecDetail }) {
  const { row } = props;
  return (
    <div className="model-communication-spec-details">
      <ModelCommunicationSpecSubsection title="Interface Properties" defaultOpen>
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
            <strong className="model-port-direction-options">
              <label>
                <input type="checkbox" checked={isMeasurementCalibrationMode(row.measurementCalibration, "read")} disabled readOnly />
                Read
              </label>
              <label>
                <input type="checkbox" checked={isMeasurementCalibrationMode(row.measurementCalibration, "write")} disabled readOnly />
                Write
              </label>
              <label>
                <input type="checkbox" checked={isMeasurementCalibrationMode(row.measurementCalibration, "readwrite")} disabled readOnly />
                ReadWrite
              </label>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong className="model-port-direction-options">
              {["Keep", "Replace", "None"].map((mode) => (
                <label key={mode}>
                  <input type="checkbox" checked={isSelectedOption(row.handleInvalid, mode)} disabled readOnly />
                  {mode}
                </label>
              ))}
            </strong>
          </div>
        </div>
      </ModelCommunicationSpecSubsection>

      <ModelCommunicationSpecSubsection title="Sender ComSpec" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Init Value</span>
            <strong className="model-inline-value-with-select">
              <span>{row.initValue}</span>
              <select value={row.initValueType} disabled>
                <option>{row.initValueType}</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Uses Tx Acknowledge</span>
            <strong>
              <input type="checkbox" checked={readBooleanMetadata(row.usesTxAcknowledge) === true} disabled readOnly />
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
              <select value={row.handleOutOfRange} disabled>
                <option>{row.handleOutOfRange}</option>
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
                <select value={row.transmissionMode} disabled>
                  <option>{row.transmissionMode}</option>
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
    </div>
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
  const rows =
    details.length > 0
      ? details
      : fallbackItems.map((item) => ({
          target: "-",
          access: "-",
          name: item
        }));
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

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
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>Access Points</span>
        <span className="model-list-section-count">{rows.length}</span>
      </button>
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
                {["DEP / Operation / Trigger", "Access", "Name"].map((label, index) => (
                  <th key={label}>
                    <span>{label}</span>
                    <button
                      type="button"
                      className="model-runnable-column-resizer"
                      aria-label={`Resize ${label} column`}
                      onPointerDown={(event) => startColumnResize(event, index)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.name}:${row.access}:${row.target}:${index}`}>
                  <td title={row.target}>{row.target}</td>
                  <td title={row.access}>{row.access}</td>
                  <td title={row.name}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

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
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>Trigger Events</span>
        <span className="model-list-section-count">{rows.length}</span>
      </button>
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
                {["Trigger", "Type", "Disable in modes", "Activation Reason", "Name"].map((label, index) => (
                  <th key={label}>
                    <span>{label}</span>
                    <button
                      type="button"
                      className="model-runnable-column-resizer"
                      aria-label={`Resize ${label} column`}
                      onPointerDown={(event) => startColumnResize(event, index)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
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

function stringifyAccessPointCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
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
          initValue: stringifyAccessPointCell(record.initValue),
          initValueType: stringifyAccessPointCell(record.initValueType),
          usesTxAcknowledge: stringifyAccessPointCell(record.usesTxAcknowledge),
          usesEndToEndProtection: stringifyAccessPointCell(record.usesEndToEndProtection),
          handleOutOfRange: stringifyAccessPointCell(record.handleOutOfRange),
          transmissionMode: stringifyAccessPointCell(record.transmissionMode),
          dataUpdatePeriod: stringifyAccessPointCell(record.dataUpdatePeriod),
          minimumSendInterval: stringifyAccessPointCell(record.minimumSendInterval),
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

function isMeasurementCalibrationMode(value: string, mode: "read" | "write" | "readwrite") {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (mode === "readwrite") {
    return normalized.includes("readwrite");
  }
  if (mode === "read") {
    return normalized === "read" || normalized.includes("readonly");
  }
  return normalized === "write" || normalized.includes("writeonly");
}

function isSelectedOption(value: string, option: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "") === option.toLowerCase().replace(/[^a-z0-9]/g, "");
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
    case "memory":
      return ["perInstanceMemory"];
    case "events":
    case "event":
      return ["interfaceTriggers", "interfaceModeGroups"];
    case "serviceDependencies":
      return ["interfaceOperations", "interfaceApplicationErrors"];
    case "exclusiveAreas":
      return [];
    default:
      return [
        "runnables",
        "calibrationVariables",
        "interRunnableVariables",
        "perInstanceMemory",
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
    case "exclusiveAreas":
      return "No exclusive areas discovered.";
    case "serviceDependencies":
      return "No service dependencies discovered.";
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

function inspectorItemRows(item: SwcInspectorItem | undefined): Array<[string, string]> {
  if (!item) {
    return [["Name", "-"]];
  }

  return [
    ["Name", item.label],
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
            onPortDoubleClick={data.onPortDoubleClick}
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
              onPortDoubleClick={data.onPortDoubleClick}
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
              onPortDoubleClick={data.onPortDoubleClick}
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
  onPortDoubleClick?: FlowNodeData["onPortDoubleClick"];
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
    onPortDoubleClick,
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
              return;
            }
            void onPortDoubleClick?.(port.filePath, port.xmlPath);
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
      { key: "label", label: "Per-instance Memory" },
      { key: "TYPE", label: "Type" },
      { key: "TYPE-DEFINITION", label: "Type Definition" }
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
