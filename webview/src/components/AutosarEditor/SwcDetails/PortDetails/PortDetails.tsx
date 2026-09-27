import type {
  AutosarEntity,
  ConnectedPortReference,
  SwcGraphPort,
  SwcKind
} from "../../../../../../src/shared/contracts";
import { formatBooleanMetadata } from "../../../Common/Details/DetailsFormatters";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";
import { DetailsBottomTabs, type DetailBreadcrumb } from "../../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";
import { PortPrototypeHierarchy } from "../../../Common/Details/PortHierarchy/PortHierarchy";
import { CommunicationSpecsSection } from "./CommunicationSpecs";
import { PortApiOptionsSection } from "./PortApiOptions";
import { ConnectedPortsList } from "./ConnectedPortsList";
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
  port: SwcGraphPort;
  modelEntities?: AutosarEntity[];
  ownerKind?: string;
  ownerSwcKind?: SwcKind;
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
  const ownerName = props.breadcrumbs?.[0]?.label ?? "Software component";
  const port = props.port;

  return (
    <DetailsBottomTabs
      title={props.title}
      contextKey={props.port?.id ?? props.title}
      breadcrumbs={props.breadcrumbs}
      renderTabContent={(content, tabId) => (
        <PortPrototypeHierarchy
          detailsFromInterface={tabId === "members" && Boolean(port.interfaceRef)}
          ownerName={ownerName}
          ownerKind={props.ownerKind ?? "Software component"}
          ownerSwcKind={props.ownerSwcKind}
          portDirection={port.direction}
          interfaceKind={port.interfaceKind}
          onOwnerOpen={props.breadcrumbs?.[0]?.onClick}
          portName={port.label}
          direction={directionLabel}
          interfaceRef={port.interfaceRef}
          onInterfaceOpen={props.onOpenReferencedEntity}
          canOpenInterface={props.canOpenReferencedEntity}
        >
          {content}
        </PortPrototypeHierarchy>
      )}
      tabs={[
        { id: "general", label: "General", content: (
          <PortGeneralFields
            port={props.port}
            title={props.title}
            interfaceKind={interfaceKind}
            directionLabel={directionLabel}
            directionOptions={directionOptions}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        ) },
        { id: "api", label: "API Options", content: (
          <PortApiOptionsSection port={props.port} argumentValues={argumentValues} />
        ) },
        { id: "members", label: specsTitle, count: displayedSpecs.length, content: (
          <CommunicationSpecsSection
            rows={displayedSpecs}
            interfaceKind={interfaceKind}
            interfaceRef={port?.interfaceRef}
            interfaceMembers={port?.details?.interfaceMembers}
            title={specsTitle}
            entities={props.modelEntities}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        ) },
        { id: "connections", label: "Connected Ports", count: props.connectedPorts.length, content: (
          <ConnectedPortsList
            connections={props.connectedPorts}
            onConnectionSelect={props.onConnectedPortSelect}
          />
        ) }
      ]}
    />
  );
}

function PortGeneralFields(props: {
  title?: string;
  port?: SwcGraphPort;
  interfaceKind: NonNullable<SwcGraphPort["interfaceKind"]>;
  directionLabel: string;
  directionOptions: string[];
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  return (
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{props.port?.label ?? props.title?.replace(/^Port:\s*/, "")}</strong>
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
            <strong>{formatPortInterfaceKindLabel(props.interfaceKind)}</strong>
          </div>
          <div>
            <span>Direction</span>
            <strong>
              <select value={props.directionLabel} disabled>
                {props.directionOptions.map((option) => (
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
  );
}
