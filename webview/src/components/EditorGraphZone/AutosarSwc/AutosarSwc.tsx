import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange
} from "@xyflow/react";
import type { RefObject } from "react";
import type { SwcGraphResult } from "../../../../../src/shared/contracts";
import type { FlowNode } from "./AutosarSwcLayout";
import { AutosarSwcNode } from "./AutosarSwcNode";
import "./AutosarSwc.css";

const nodeTypes = {
  autosarNode: AutosarSwcNode
};

const ignoreNodeChanges: OnNodesChange = () => undefined;
const ignoreEdgeChanges: OnEdgesChange = () => undefined;

export interface AutosarSwcController {
  getNode: (id: string) =>
    | {
        positionAbsolute?: { x: number; y: number };
        width?: number;
        height?: number;
      }
    | undefined;
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

/** Renders the interactive SWC graph and its loading, error, and empty states. */
export function AutosarSwc(props: AutosarSwcProps) {
  const {
    canvasRef,
    canvasKey,
    nodes,
    edges,
    graphResult,
    loading,
    error,
    warnings,
    fitViewOptions,
    onInit,
    onNodeClick,
    onNodeDoubleClick
  } = props;

  let graphContent: React.ReactNode;
  if (error) {
    graphContent = <div className="empty-state">Could not build the model graph: {error}</div>;
  } else if (loading) {
    graphContent = <div className="empty-state">Building AUTOSAR graph…</div>;
  } else if (!graphResult || graphResult.nodes.length === 0) {
    graphContent = <div className="empty-state">Select an SWC or composition to visualize it.</div>;
  } else {
    graphContent = (
      <ReactFlowProvider>
        <ReactFlow
          key={canvasKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            onInit({
              getNode: (id) => instance.getNode(id),
              setCenter: (x, y, options) => instance.setCenter(x, y, options)
            });
          }}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.35}
          maxZoom={1.5}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodesChange={ignoreNodeChanges}
          onEdgesChange={ignoreEdgeChanges}
        >
          <Background color="#d7e2ef" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    );
  }

  return (
    <div className="model-canvas-shell" ref={canvasRef}>
      {warnings.length > 0 && (
        <div className="model-warning-strip">
          {warnings.map((warning) => warning.message).join(" ")}
        </div>
      )}
      {graphContent}
    </div>
  );
}
