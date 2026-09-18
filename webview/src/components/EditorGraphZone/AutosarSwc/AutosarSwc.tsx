import {
  Background,
  ConnectionMode,
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
          nodes={props.nodes}
          edges={props.edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            props.onInit({
              getNode: (id) => instance.getNode(id),
              setCenter: (x, y, options) => instance.setCenter(x, y, options)
            });
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
