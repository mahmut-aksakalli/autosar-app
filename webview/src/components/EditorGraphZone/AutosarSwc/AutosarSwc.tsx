import {
  Background,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SwcGraphResult } from "../../../../../src/shared/contracts";
import type { FlowNode } from "./AutosarSwcLayout";
import { SwcNode } from "./SwcNode/SwcNode";
import { SearchBox } from "./SearchBox/SearchBox";
import "./AutosarSwc.css";

const nodeTypes = {
  autosarNode: SwcNode
};

const ignoreNodeChanges: OnNodesChange = () => undefined;
const ignoreEdgeChanges: OnEdgesChange = () => undefined;
const SEARCH_RESULT_ZOOM = 1.2;

export interface AutosarSwcController {
  getNode: (id: string) =>
    | {
        positionAbsolute?: { x: number; y: number };
        width?: number;
        height?: number;
      }
    | undefined;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  fitView: (options?: {
    padding?: number;
    maxZoom?: number;
    minZoom?: number;
    duration?: number;
  }) => unknown;
  setCenter: (
    x: number,
    y: number,
    options?: { zoom?: number; duration?: number }
  ) => unknown;
}

interface AutosarSwcProps {
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasKey: string;
  nodes: FlowNode[];
  edges: Edge[];
  graphResult?: SwcGraphResult;
  loading: boolean;
  error?: string;
  warnings: SwcGraphResult["warnings"];
  fitViewOptions: {
    padding: number;
    maxZoom: number;
    minZoom: number;
  };
  onInit: (controller: AutosarSwcController) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
}

interface GraphSearchMatch {
  nodeId: string;
  key: string;
}

/** Renders the interactive SWC graph and its loading, error, and empty states. */
export function AutosarSwc(props: AutosarSwcProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AutosarSwcController | null>(null);
  const normalizedSearchQuery = searchQuery.trim();
  const searchMatches = useMemo(
    () => collectGraphSearchMatches(props.nodes, normalizedSearchQuery),
    [props.nodes, normalizedSearchQuery]
  );
  let visibleMatchIndex = activeMatchIndex;
  if (searchMatches.length === 0) {
    visibleMatchIndex = 0;
  } else if (visibleMatchIndex >= searchMatches.length) {
    visibleMatchIndex = searchMatches.length - 1;
  }
  const activeMatch = searchMatches[visibleMatchIndex];
  const searchNodes = useMemo(() => {
    if (!normalizedSearchQuery) {
      return props.nodes;
    }

    const matchingNodeIds = new Set(searchMatches.map((match) => match.nodeId));
    return props.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        searchQuery: normalizedSearchQuery,
        activeSearchKey: activeMatch?.nodeId === node.id ? activeMatch.key : undefined,
        isSearchMatch: matchingNodeIds.has(node.id)
      }
    }));
  }, [activeMatch, normalizedSearchQuery, props.nodes, searchMatches]);

  useEffect(() => {
    setSearchQuery("");
    setActiveMatchIndex(0);
  }, [props.canvasKey]);

  useEffect(() => {
    function focusGraphSearch(event: KeyboardEvent) {
      if (event.key === "Escape" && searchQuery) {
        event.preventDefault();
        setSearchQuery("");
        setActiveMatchIndex(0);
        void controllerRef.current?.fitView({ ...props.fitViewOptions, duration: 220 });
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "f") {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }

    window.addEventListener("keydown", focusGraphSearch);
    return () => window.removeEventListener("keydown", focusGraphSearch);
  }, [props.fitViewOptions, searchQuery]);

  useEffect(() => {
    if (!activeMatch || !controllerRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (!controllerRef.current) {
        return;
      }

      const targetElement = findSearchTargetElement(
        props.canvasRef.current,
        activeMatch.nodeId,
        activeMatch.key
      );
      if (targetElement) {
        const bounds = targetElement.getBoundingClientRect();
        const targetPosition = controllerRef.current.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2
        });
        void controllerRef.current.setCenter(targetPosition.x, targetPosition.y, {
          zoom: SEARCH_RESULT_ZOOM,
          duration: 220
        });
        return;
      }

      // Fall back to the containing node if its text has not been measured yet.
      const node = controllerRef.current.getNode(activeMatch.nodeId);
      if (!node?.positionAbsolute) {
        return;
      }
      const centerX = node.positionAbsolute.x + (node.width ?? 0) / 2;
      const centerY = node.positionAbsolute.y + (node.height ?? 0) / 2;
      void controllerRef.current.setCenter(centerX, centerY, {
        zoom: SEARCH_RESULT_ZOOM,
        duration: 220
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeMatch]);

  function showPreviousMatch() {
    if (searchMatches.length === 0) {
      return;
    }
    setActiveMatchIndex((current) => {
      const boundedIndex = Math.min(current, searchMatches.length - 1);
      return (boundedIndex - 1 + searchMatches.length) % searchMatches.length;
    });
  }

  function showNextMatch() {
    if (searchMatches.length === 0) {
      return;
    }
    setActiveMatchIndex((current) => (current + 1) % searchMatches.length);
  }

  function clearSearch() {
    const shouldRestoreOverview = Boolean(searchQuery);
    setSearchQuery("");
    setActiveMatchIndex(0);
    if (shouldRestoreOverview) {
      void controllerRef.current?.fitView({ ...props.fitViewOptions, duration: 220 });
    }
  }

  let graphContent: React.ReactNode;
  if (props.error) {
    graphContent = <div className="empty-state">Could not build the model graph: {props.error}</div>;
  } else if (props.loading) {
    graphContent = <div className="empty-state">Building AUTOSAR graph…</div>;
  } else if (!props.graphResult || props.graphResult.nodes.length === 0) {
    graphContent = <div className="empty-state">Select an SWC or composition to visualize it.</div>;
  } else {
    graphContent = (
      <ReactFlowProvider>
        <ReactFlow
          key={props.canvasKey}
          nodes={searchNodes}
          edges={props.edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            const controller: AutosarSwcController = {
              getNode: (id) => instance.getNode(id),
              screenToFlowPosition: (position) => instance.screenToFlowPosition(position),
              fitView: (options) => instance.fitView(options),
              setCenter: (x, y, options) => instance.setCenter(x, y, options)
            };
            controllerRef.current = controller;
            props.onInit(controller);
          }}
          fitView
          fitViewOptions={props.fitViewOptions}
          minZoom={0.35}
          maxZoom={1.5}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={props.onNodeClick}
          onNodeDoubleClick={props.onNodeDoubleClick}
          onNodesChange={ignoreNodeChanges}
          onEdgesChange={ignoreEdgeChanges}
        >
          <Background color="#d7e2ef" gap={20} />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <SearchBox
              inputRef={searchInputRef}
              query={searchQuery}
              activeMatchIndex={visibleMatchIndex}
              matchCount={searchMatches.length}
              onQueryChange={(query) => {
                setSearchQuery(query);
                setActiveMatchIndex(0);
              }}
              onPrevious={showPreviousMatch}
              onNext={showNextMatch}
              onClear={clearSearch}
            />
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    );
  }

  return (
    <div className="model-canvas-shell" ref={props.canvasRef}>
      {props.warnings.length > 0 && (
        <div className="model-warning-strip">
          {props.warnings.map((warning) => warning.message).join(" ")}
        </div>
      )}
      {graphContent}
    </div>
  );
}

function collectGraphSearchMatches(nodes: FlowNode[], query: string): GraphSearchMatch[] {
  if (!query) {
    return [];
  }

  const matches: GraphSearchMatch[] = [];
  nodes.forEach((node) => {
    addSearchMatch(matches, node.id, "node:label", node.data.label, query);
    addSearchMatch(matches, node.id, "node:secondary", node.data.secondaryLabel, query);

    node.data.ports.forEach((port) => {
      addSearchMatch(matches, node.id, `port:${port.id}:label`, port.label, query);

      const connections = node.data.portConnections?.[port.id] ?? [];
      connections.forEach((connection, index) => {
        addSearchMatch(
          matches,
          node.id,
          `connection:${port.id}:${index}:component`,
          connection.componentName,
          query
        );
        addSearchMatch(
          matches,
          node.id,
          `connection:${port.id}:${index}:port`,
          connection.portName,
          query
        );
      });
    });
  });
  return matches;
}

function addSearchMatch(
  matches: GraphSearchMatch[],
  nodeId: string,
  key: string,
  text: string | undefined,
  query: string
) {
  if (!text?.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
    return;
  }
  matches.push({ nodeId, key });
}

function findSearchTargetElement(
  canvas: HTMLDivElement | null,
  nodeId: string,
  searchKey: string
) {
  if (!canvas) {
    return undefined;
  }

  const candidates = canvas.querySelectorAll<HTMLElement>("[data-search-node-id][data-search-key]");
  return Array.from(candidates).find((candidate) => {
    return candidate.dataset.searchNodeId === nodeId && candidate.dataset.searchKey === searchKey;
  });
}
