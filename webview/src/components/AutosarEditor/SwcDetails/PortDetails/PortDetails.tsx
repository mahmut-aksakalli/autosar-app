import type {
  ConnectedPortReference,
  SwcGraphPort
} from "../../../../../../src/shared/contracts";
import { formatBooleanMetadata } from "../../../Common/Details/DetailsFormatters";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";
import { DetailsBottomTabs, type DetailBreadcrumb } from "../../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";
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
  breadcrumbs?: DetailBreadcrumb[];
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
    <DetailsBottomTabs
      title={props.title}
      contextKey={props.port?.id ?? props.title}
      breadcrumbs={props.breadcrumbs}
      tabs={[
        { id: "general", label: "General", content: (
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
        ) },
        { id: "api", label: "API Options", content: (
          <PortApiOptionsSection port={props.port} argumentValues={argumentValues} />
        ) },
        { id: "members", label: specsTitle, count: displayedSpecs.length, content: (
          <CommunicationSpecsSection
            rows={displayedSpecs}
            interfaceKind={interfaceKind}
            title={specsTitle}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        ) },
        { id: "connections", label: "Connected Ports", count: props.connectedPorts.length, content: (
          <ConnectedPortsTable
            connections={props.connectedPorts}
            onConnectionSelect={props.onConnectedPortSelect}
          />
        ) }
      ]}
    />
  );
}
