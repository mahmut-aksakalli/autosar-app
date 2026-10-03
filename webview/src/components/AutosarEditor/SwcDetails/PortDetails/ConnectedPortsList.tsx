import type { ConnectedPortReference } from "../../../../../../src/shared/contracts";
import { PortHierarchyPortIcon } from "../../../Common/Details/PortHierarchy/PortHierarchy";
import { formatPortDirectionLabel } from "./CommunicationSpecHelper";
import "./ConnectedPortsList.css";

export function ConnectedPortsList(props: {
  connections: ConnectedPortReference[];
  onConnectionSelect?: (connection: ConnectedPortReference) => void;
}) {
  const connections = [...props.connections].sort((left, right) => {
    const ownerOrder = left.swcName.localeCompare(right.swcName);
    if (ownerOrder !== 0) {
      return ownerOrder;
    }
    return left.portName.localeCompare(right.portName);
  });

  return (
    <section className="model-connected-port-list" aria-label="Connected ports">
      <span className="model-port-hierarchy-heading">Connected port prototypes</span>
      {connections.length > 0 ? (
        <ul>
          {connections.map((connection) => {
            const portType = connection.portDirection
              ? `${formatPortDirectionLabel(connection.portDirection, connection.interfaceKind)} port prototype`
              : "Port prototype";
            const canOpen = Boolean(
              props.onConnectionSelect &&
              connection.portId &&
              (connection.ownerEntityId || connection.ownerSemanticPath)
            );

            return (
              <li key={`${connection.connectionId}:${connection.portId ?? connection.portName}`}>
                <div className="model-port-hierarchy-card">
                  <PortHierarchyPortIcon
                    direction={connection.portDirection ?? "provided-required"}
                    interfaceKind={connection.interfaceKind}
                  />
                  <div className="model-port-hierarchy-card-content">
                    <span className="model-port-hierarchy-kind">
                      {portType} of {connection.swcName}
                    </span>
                    {canOpen ? (
                      <button
                        type="button"
                        aria-label={`Open ${connection.portName} of ${connection.swcName}`}
                        onClick={() => props.onConnectionSelect?.(connection)}
                      >
                        {connection.portName}
                      </button>
                    ) : (
                      <strong>{connection.portName}</strong>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="model-port-hierarchy-empty">No connected ports discovered.</p>
      )}
    </section>
  );
}
