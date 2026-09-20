import type {
  ConnectedPortReference,
  SwcGraphPort
} from "../../../../../../src/shared/contracts";
import { formatBooleanMetadata } from "../../../Common/Details/DetailsFormatters";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";
import { CommunicationSpecsSection } from "./CommunicationSpecs";
import { PortApiOptionsSection } from "./PortApiOptions";
import { ConnectedPortsTable } from "./ConnectedPortsTable";
import {
  formatPortDirectionLabel,
  formatPortInterfaceKindLabel,
  getPortDirectionOptions,
  mapInterfaceMemberDetails,
  normalizeCommunicationSpecDetails,
  normalizePortDefinedArgumentValues
} from "./CommunicationSpecHelper";

export function PortDetails(props: {
  title: string;
  port?: SwcGraphPort;
  connectedPorts: ConnectedPortReference[];
  onConnectedPortSelect?: (connection: ConnectedPortReference) => void;
  filePath?: string;
  xmlPath?: string;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const argumentValues = normalizePortDefinedArgumentValues(props.port?.details?.portDefinedArgumentValues ?? []);
  const communicationSpecs = normalizeCommunicationSpecDetails(props.port?.details?.communicationSpecs ?? []);
  const interfaceMemberDetails = mapInterfaceMemberDetails(props.port?.details?.interfaceMembers ?? []);
  const displayedSpecs = communicationSpecs.length > 0 ? communicationSpecs : interfaceMemberDetails;
  const specsTitle = communicationSpecs.length > 0 ? "Communication Specs" : "Interface Members";
  const interfaceKind = props.port?.interfaceKind ?? "unknown";
  const directionOptions = getPortDirectionOptions(interfaceKind);
  const directionLabel = formatPortDirectionLabel(props.port?.direction, interfaceKind);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{props.port?.label ?? props.title.replace(/^Port:\s*/, "")}</strong>
          </div>
          <div>
            <span>Port Interface</span>
            <ReferenceValue
              referencePath={props.port?.interfaceRef}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
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
            <strong>{formatBooleanMetadata(props.port?.metadata?.["IS-SERVICE"])}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{props.port?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>

        <PortApiOptionsSection port={props.port} argumentValues={argumentValues} />
        <CommunicationSpecsSection
          rows={displayedSpecs}
          interfaceKind={interfaceKind}
          title={specsTitle}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
        <ConnectedPortsTable
          connections={props.connectedPorts}
          onConnectionSelect={props.onConnectedPortSelect}
        />
      </div>
    </div>
  );
}
