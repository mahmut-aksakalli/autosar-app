import type { NodeProps } from "@xyflow/react";
import type { SwcGraphNode } from "../../../../../src/shared/contracts";
import { getPortRailWidth, type FlowNode } from "./AutosarSwcLayout";
import { AutosarSwcPorts } from "./AutosarSwcPorts";
import "./AutosarSwcNode.css";

export function AutosarSwcNode(props: NodeProps<FlowNode>) {
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

  return (
    <div className={`autosar-node autosar-node-${props.data.kind}`}>
      <div className="autosar-symbol">
        <div className="autosar-symbol-rail autosar-symbol-rail-left">
          <AutosarSwcPorts
            ports={requiredPorts}
            portConnections={props.data.portConnections}
            side="left"
            railWidth={leftRailWidth}
            highlightedPortId={props.data.highlightedPortId}
            onConnectionNavigate={props.data.onConnectionNavigate}
          />
        </div>
        <div className="autosar-symbol-body">
          <div className="autosar-node-header">
            <div className="autosar-node-badges">
              <span className="autosar-node-badge">
                <span className="autosar-family-glyph" aria-hidden="true">
                  {formatSwcKindGlyph(props.data.swcKind)}
                </span>
                {kindLabel}
              </span>
            </div>
            <strong>{props.data.label}</strong>
          </div>
          {props.data.secondaryLabel && <div className="autosar-node-subtitle">{props.data.secondaryLabel}</div>}
          {props.data.warning && <div className="autosar-node-warning">{props.data.warning}</div>}
        </div>
        <div className="autosar-symbol-rail autosar-symbol-rail-right">
          <AutosarSwcPorts
            ports={providedPorts}
            portConnections={props.data.portConnections}
            side="right"
            railWidth={rightRailWidth}
            highlightedPortId={props.data.highlightedPortId}
            onConnectionNavigate={props.data.onConnectionNavigate}
          />
        </div>
      </div>
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
