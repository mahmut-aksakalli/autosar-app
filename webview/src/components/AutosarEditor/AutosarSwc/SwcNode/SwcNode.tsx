import type { NodeProps } from "@xyflow/react";
import { useCallback, useState } from "react";
import type { SwcGraphNode } from "../../../../../../src/shared/contracts";
import { getPortRailWidth, type FlowNode } from "../AutosarSwcLayout";
import { SwcNodeContextMenu } from "./SwcNodeContextMenu/SwcNodeContextMenu";
import { SwcPorts } from "./SwcPorts/SwcPorts";
import { HighlightedText } from "../SearchBox/HighlightedText";
import "./SwcNode.css";

export function SwcNode(props: NodeProps<FlowNode>) {
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>();
  const closeContextMenu = useCallback(() => setContextMenuPosition(undefined), []);
  const providedPorts = props.data.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  const requiredPorts = props.data.ports.filter((port) => port.direction === "required");
  const leftRailWidth = getPortRailWidth(requiredPorts);
  const rightRailWidth = getPortRailWidth(providedPorts);

  let kindLabel = formatSwcKindLabel(props.data.swcKind);
  if (props.data.kind === "composition") {
    kindLabel = "Composition";
  }

  let nodeClassName = `autosar-node autosar-node-${props.data.kind}`;
  if (props.data.searchQuery && !props.data.isSearchMatch) {
    nodeClassName += " is-search-dimmed";
  }

  return (
    <div className={nodeClassName}>
      <div className="autosar-symbol">
        <div className="autosar-symbol-rail autosar-symbol-rail-left">
          <SwcPorts
            ports={requiredPorts}
            portConnections={props.data.portConnections}
            side="left"
            railWidth={leftRailWidth}
            highlightedPortId={props.data.highlightedPortId}
            selectedPortId={props.data.selectedPortId}
            onPortSelect={props.data.onPortSelect}
            onPortInterfaceOpen={props.data.onPortInterfaceOpen}
            onConnectionNavigate={props.data.onConnectionNavigate}
            onCopyText={props.data.onCopyText}
            onPortDetailsOpen={props.data.onPortDetailsOpen}
            searchQuery={props.data.searchQuery}
            activeSearchKey={props.data.activeSearchKey}
            searchNodeId={props.id}
          />
        </div>
        <div
          className="autosar-symbol-body"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenuPosition({ x: event.clientX, y: event.clientY });
          }}
        >
          <div className="autosar-node-header">
            <div className="autosar-node-badges">
              <span className="autosar-node-badge">
                <span className="autosar-family-symbol" aria-hidden="true">
                  {formatSwcKindSymbol(props.data.swcKind)}
                </span>
                {kindLabel}
              </span>
            </div>
            <strong>
              <HighlightedText
                text={props.data.label}
                query={props.data.searchQuery}
                active={props.data.activeSearchKey === "node:label"}
                searchNodeId={props.id}
                searchKey="node:label"
              />
            </strong>
          </div>
          {props.data.secondaryLabel && (
            <div className="autosar-node-subtitle">
              <HighlightedText
                text={props.data.secondaryLabel}
                query={props.data.searchQuery}
                active={props.data.activeSearchKey === "node:secondary"}
                searchNodeId={props.id}
                searchKey="node:secondary"
              />
            </div>
          )}
          {props.data.warning && <div className="autosar-node-warning">{props.data.warning}</div>}
        </div>
        <div className="autosar-symbol-rail autosar-symbol-rail-right">
          <SwcPorts
            ports={providedPorts}
            portConnections={props.data.portConnections}
            side="right"
            railWidth={rightRailWidth}
            highlightedPortId={props.data.highlightedPortId}
            selectedPortId={props.data.selectedPortId}
            onPortSelect={props.data.onPortSelect}
            onPortInterfaceOpen={props.data.onPortInterfaceOpen}
            onConnectionNavigate={props.data.onConnectionNavigate}
            onCopyText={props.data.onCopyText}
            onPortDetailsOpen={props.data.onPortDetailsOpen}
            searchQuery={props.data.searchQuery}
            activeSearchKey={props.data.activeSearchKey}
            searchNodeId={props.id}
          />
        </div>
      </div>
      {contextMenuPosition && (
        <SwcNodeContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          onClose={closeContextMenu}
          onCopyName={props.data.onCopyName}
          onOpenView={props.data.onOpenView}
        />
      )}
    </div>
  );
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

function formatSwcKindSymbol(kind: SwcGraphNode["swcKind"]) {
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
