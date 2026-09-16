import type { SwcGraphPort } from "../../../../../../src/shared/contracts";
import { formatBooleanMetadata, formatReferenceShortName } from "../DetailsFormatters";
import { CommunicationSpecsSection } from "./CommunicationSpecs";
import { PortApiOptionsSection } from "./PortApiOptions";
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
  filePath?: string;
  xmlPath?: string;
}) {
  const { title, port } = props;
  const argumentValues = normalizePortDefinedArgumentValues(port?.details?.portDefinedArgumentValues ?? []);
  const communicationSpecs = normalizeCommunicationSpecDetails(port?.details?.communicationSpecs ?? []);
  const interfaceMemberDetails = mapInterfaceMemberDetails(port?.details?.interfaceMembers ?? []);
  const displayedSpecs = communicationSpecs.length > 0 ? communicationSpecs : interfaceMemberDetails;
  const specsTitle = communicationSpecs.length > 0 ? "Communication Specs" : "Interface Members";
  const interfaceKind = port?.interfaceKind ?? "unknown";
  const directionOptions = getPortDirectionOptions(interfaceKind);
  const directionLabel = formatPortDirectionLabel(port?.direction, interfaceKind);

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Name</span>
            <strong>{port?.label ?? title.replace(/^Port:\s*/, "")}</strong>
          </div>
          <div>
            <span>Port Interface</span>
            <strong>{formatReferenceShortName(port?.interfaceRef)}</strong>
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
            <strong>{formatBooleanMetadata(port?.metadata?.["IS-SERVICE"])}</strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{port?.metadata?.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>

        <PortApiOptionsSection port={port} argumentValues={argumentValues} />
        <CommunicationSpecsSection rows={displayedSpecs} interfaceKind={interfaceKind} title={specsTitle} />
      </div>
    </div>
  );
}
