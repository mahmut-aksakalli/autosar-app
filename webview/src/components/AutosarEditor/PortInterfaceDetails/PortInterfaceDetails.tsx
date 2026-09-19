import type {
  AutosarEntity,
  EntityReferenceInstance
} from "../../../../../src/shared/contracts";
import { ReferenceInstancesTable } from "../../Common/Table/ReferenceInstancesTable";
import { EntityDetailTable } from "../../Common/Table/EntityDetailTable";
import {
  formatInitValueTypeOption,
  formatReferenceShortName,
  initValueTypeOptions,
  readBooleanMetadata
} from "../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../Common/Details/InitValueDisplay";
import { ClientServerPortDetails } from "./ClientServerPortDetails/ClientServerPortDetails";
import { buildPortInterfaceDetailTables } from "./PortInterfaceDetailsHelper";
import { SenderReceiverPortDetails } from "./SenderReceiverPortDetails/SenderReceiverPortDetails";

export function PortInterfaceDetails(props: {
  title: string;
  entity: AutosarEntity;
  referenceInstances: EntityReferenceInstance[];
  selectedInstancePath?: string;
  onReferenceInstanceSelect?: (instance: EntityReferenceInstance) => void;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const metadata = props.entity.metadata ?? {};
  const details = props.entity.details?.entity ?? { fields: [], tables: [] };
  const interfaceMembers = props.entity.details?.interfaceMembers ?? [];
  const interfaceTables = buildPortInterfaceDetailTables(props.entity, interfaceMembers);
  const interfaceType =
    details.fields.find((field) => field.label === "Interface Type")?.value ?? "-";
  const isService =
    details.fields.find((field) => field.label === "Is Service")?.value ?? "false";
  const fields = [
    { label: "Name", value: props.entity.shortName },
    { label: "Port Interface Type", value: interfaceType },
    {
      label: "Package",
      value: props.entity.parentSemanticPath ?? props.entity.packagePath ?? "-"
    },
    { label: "Is Service", value: isService },
    { label: "Description", value: metadata.DESCRIPTION ?? "-" },
    ...details.fields.filter((field) => {
      return (
        field.label !== "Interface Type" &&
        field.label !== "Is Service" &&
        field.label !== "Service Kind"
      );
    })
  ];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{props.title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {fields.map((field, index) => (
            <div key={`${field.label}:${index}`}>
              <span>{field.label}</span>
              <strong title={field.value}>
                <PortInterfaceFieldValue field={field} />
              </strong>
            </div>
          ))}
        </div>

        {props.entity.interfaceKind === "sender-receiver" && (
          <SenderReceiverPortDetails
            members={interfaceMembers}
            preferredMemberPath={props.selectedInstancePath}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        )}
        {props.entity.interfaceKind === "client-server" && (
          <ClientServerPortDetails
            members={interfaceMembers}
            preferredMemberPath={props.selectedInstancePath}
          />
        )}
        {[...details.tables, ...interfaceTables].map((table) => (
          <EntityDetailTable key={table.title} table={table} />
        ))}
        <ReferenceInstancesTable
          instances={props.referenceInstances}
          onInstanceSelect={props.onReferenceInstanceSelect}
        />
      </div>
    </div>
  );
}

function PortInterfaceFieldValue(props: {
  field: { label: string; value: string; valueType?: string };
}) {
  if (props.field.label === "Is Service") {
    return (
      <input
        type="checkbox"
        checked={readBooleanMetadata(props.field.value) === true}
        disabled
        readOnly
      />
    );
  }

  if (props.field.valueType) {
    return (
      <span className="model-inline-value-with-select">
        <select value={formatInitValueTypeOption(props.field.valueType)} disabled>
          {initValueTypeOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <InitValueDisplay value={props.field.value} type={props.field.valueType} />
      </span>
    );
  }

  if (props.field.label === "Package") {
    return props.field.value;
  }

  if (props.field.value.startsWith("/")) {
    return formatReferenceShortName(props.field.value);
  }

  return props.field.value;
}
