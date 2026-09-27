import { useEffect, useState } from "react";
import type { AutosarEntity, EntityDetailPayload, InterfaceDetailMember } from "../../../../../../src/shared/contracts";
import { MemberRelationshipView } from "../../../Common/Details/MemberRelationship/MemberRelationshipView";
import { OperationSignature } from "../../../Common/Details/MemberRelationship/OperationSignature";
import { OperationPossibleErrors } from "../../../Common/Details/MemberRelationship/OperationPossibleErrors";
import { EntityDetailTable } from "../../../Common/Table/EntityDetailTable";
import { splitMetadataList } from "../../../Common/Details/DetailsFormatters";

export function ClientServerPortDetails(props: {
  members: InterfaceDetailMember[];
  preferredMemberPath?: string;
  entities?: AutosarEntity[];
  comSpecsByMember?: Record<string, string[]>;
  additionalTables?: EntityDetailPayload["tables"];
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const operations = props.members.filter((member) => member.kind === "operation");
  const applicationErrors = props.members.filter((member) => member.kind === "applicationError");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() =>
    props.preferredMemberPath ?? operations[0]?.semanticPath ?? operations[0]?.label
  );
  const selectedOperation =
    operations.find((member) => (member.semanticPath ?? member.label) === selectedKey) ??
    operations[0];

  useEffect(() => {
    if (props.preferredMemberPath) {
      setSelectedKey(props.preferredMemberPath);
    }
  }, [props.preferredMemberPath]);

  return (
    <>
      <MemberRelationshipView
        title="Operations and ComSpecs"
        items={operations.map((operation, index) => ({
          key: operation.semanticPath ?? operation.label,
          label: operation.label,
          number: String(index + 1),
          description: props.comSpecsByMember?.[operation.semanticPath ?? operation.label]?.join("\n")
        }))}
        selectedKey={selectedOperation?.semanticPath ?? selectedOperation?.label}
        onSelect={setSelectedKey}
        selectedKind="Operation"
        selectedName={selectedOperation?.label}
        listFooter={selectedOperation && applicationErrors.length > 0 ? (
          <OperationPossibleErrors
            applicationErrors={applicationErrors}
            selectedErrors={splitMetadataList(selectedOperation.metadata?.ERRORS)}
          />
        ) : undefined}
        focus={selectedOperation ? (
          <OperationSignature
            key={selectedOperation.semanticPath ?? selectedOperation.label}
            operation={selectedOperation}
            entities={props.entities}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        ) : undefined}
      >
        {!selectedOperation && (
          <div className="model-list-empty">Select an operation.</div>
        )}
      </MemberRelationshipView>
      {props.additionalTables?.map((table) => (
        <EntityDetailTable key={table.title} table={table} />
      ))}
    </>
  );
}
