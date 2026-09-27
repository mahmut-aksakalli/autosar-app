import { useEffect, useState } from "react";
import type { AutosarEntity, EntityDetailPayload, InterfaceDetailMember } from "../../../../../../src/shared/contracts";
import { CollapsibleSection } from "../../../Common/CollapsibleSection";
import { EntityDetailTable } from "../../../Common/Table/EntityDetailTable";
import { MemberReferencePath } from "../../../Common/Details/MemberRelationship/MemberReferencePath";
import { MemberRelationshipView } from "../../../Common/Details/MemberRelationship/MemberRelationshipView";
import {
  formatHandleInvalidOption,
  formatMeasurementCalibrationOption,
  formatReferenceShortName,
  readBooleanMetadata
} from "../../../Common/Details/DetailsFormatters";
import { ReferenceValue } from "../../../Common/Details/ReferenceValue";

export function SenderReceiverPortDetails(props: {
  members: InterfaceDetailMember[];
  preferredMemberPath?: string;
  entities?: AutosarEntity[];
  comSpecsByMember?: Record<string, string[]>;
  additionalTables?: EntityDetailPayload["tables"];
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const dataElements = props.members.filter((member) => member.kind === "dataElement");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    props.preferredMemberPath ?? dataElements[0]?.semanticPath ?? dataElements[0]?.label
  );
  const selectedElement =
    dataElements.find((member) => (member.semanticPath ?? member.label) === selectedKey) ??
    dataElements[0];

  useEffect(() => {
    if (props.preferredMemberPath) {
      setSelectedKey(props.preferredMemberPath);
    }
  }, [props.preferredMemberPath]);

  return (
    <MemberRelationshipView
      title="Data elements"
      items={dataElements.map((member, index) => ({
        key: member.semanticPath ?? member.label,
        label: member.label,
        number: String(index + 1),
        description: props.comSpecsByMember?.[member.semanticPath ?? member.label]?.join("\n")
      }))}
      selectedKey={selectedElement?.semanticPath ?? selectedElement?.label}
      onSelect={setSelectedKey}
      selectedKind="Data Element"
      selectedName={selectedElement?.label}
      path={selectedElement ? (
        <MemberReferencePath
          dataType={selectedElement.metadata?.TYPE}
          dataConstraints={selectedElement.metadata?.["DATA-CONSTRAINTS"]}
          entities={props.entities}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      ) : undefined}
    >
      {selectedElement ? (
        <PortInterfaceDataElementDetails
          member={selectedElement}
          onOpenReferencedEntity={props.onOpenReferencedEntity}
          canOpenReferencedEntity={props.canOpenReferencedEntity}
        />
      ) : (
        <div className="model-list-empty">Select a data element.</div>
      )}
      {props.additionalTables?.map((table) => (
        <EntityDetailTable key={table.title} table={table} />
      ))}
    </MemberRelationshipView>
  );
}

function PortInterfaceDataElementDetails(props: {
  member: InterfaceDetailMember;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const metadata = props.member.metadata ?? {};

  return (
    <div className="model-communication-spec-details">
      <CollapsibleSection title="Data Element Properties" defaultOpen>
        <div className="model-semantic-kv model-port-fields">
          <div>
            <span>Data Type</span>
            <ReferenceValue
              referencePath={metadata.TYPE}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </div>
          <div>
            <span>Data Constraints</span>
            <ReferenceValue
              referencePath={metadata["DATA-CONSTRAINTS"]}
              onOpen={props.onOpenReferencedEntity}
              canOpen={props.canOpenReferencedEntity}
            />
          </div>
          <div>
            <span>Addressing Method</span>
            <strong>{formatReferenceShortName(metadata["SW-ADDR-METHOD-REF"])}</strong>
          </div>
          <div>
            <span>Use queued communication</span>
            <strong>
              <input
                type="checkbox"
                checked={readBooleanMetadata(metadata["IS-QUEUED"]) === true}
                disabled
                readOnly
              />
            </strong>
          </div>
          <div>
            <span>Measurement&amp;Calibration</span>
            <strong>
              <select
                value={formatMeasurementCalibrationOption(
                  metadata["SW-CALIBRATION-ACCESS"] ?? "-"
                )}
                disabled
              >
                <option>Not Accessible</option>
                <option>Read</option>
                <option>Write</option>
                <option>ReadWrite</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Handle invalid</span>
            <strong>
              <select
                value={formatHandleInvalidOption(metadata["HANDLE-INVALID"] ?? "-")}
                disabled
              >
                <option>Keep</option>
                <option>Replace</option>
                <option>None</option>
              </select>
            </strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{metadata.DESCRIPTION ?? "-"}</strong>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
