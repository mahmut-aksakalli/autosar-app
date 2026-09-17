import type { NodeProps } from "@xyflow/react";
import type { SwcGraphNode } from "../../../../../src/shared/contracts";
import { getPortRailWidth, type FlowNode } from "./AutosarSwcLayout";
import { AutosarSwcPorts } from "./AutosarSwcPorts";
import "./AutosarSwcNode.css";

export function AutosarSwcNode({ data }: NodeProps<FlowNode>) {
  const providedPorts = data.ports.filter(
    (port) => port.direction === "provided" || port.direction === "provided-required"
  );
  const requiredPorts = data.ports.filter((port) => port.direction === "required");
  const leftRailWidth = getPortRailWidth(requiredPorts);
  const rightRailWidth = getPortRailWidth(providedPorts);

  let kindLabel = formatSwcKindLabel(data.swcKind);
  if (data.kind === "composition") {
    kindLabel = "Composition";
  }

  return (
    <div className={`autosar-node autosar-node-${data.kind}`}>
      <div className="autosar-symbol">
        <div className="autosar-symbol-rail autosar-symbol-rail-left">
          <AutosarSwcPorts
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
            <div className="autosar-node-badges">
              <span className="autosar-node-badge">
                <span className="autosar-family-glyph" aria-hidden="true">
                  {formatSwcKindGlyph(data.swcKind)}
                </span>
                {kindLabel}
              </span>
            </div>
            <strong>{data.label}</strong>
          </div>
          {data.secondaryLabel && <div className="autosar-node-subtitle">{data.secondaryLabel}</div>}
          {data.warning && <div className="autosar-node-warning">{data.warning}</div>}
        </div>
        <div className="autosar-symbol-rail autosar-symbol-rail-right">
          <AutosarSwcPorts
            ports={providedPorts}
            portConnections={data.portConnections}
            side="right"
            railWidth={rightRailWidth}
            highlightedPortId={data.highlightedPortId}
            onConnectionNavigate={data.onConnectionNavigate}
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
