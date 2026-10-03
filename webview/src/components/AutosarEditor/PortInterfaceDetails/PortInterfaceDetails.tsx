import type {
  AutosarEntity,
  EntityReferenceInstance,
  PortDirection,
  PortInterfaceKind
} from "../../../../../src/shared/contracts";
import { EntityDetailTable } from "../../Common/Table/EntityDetailTable";
import {
  formatAutosarTagText,
  formatInitValueTypeOption,
  formatReferenceShortName,
  initValueTypeOptions,
  readBooleanMetadata
} from "../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../Common/Details/InitValueDisplay";
import { DetailsBottomTabs, type DetailBreadcrumb } from "../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";
import { PortInterfaceHierarchy } from "../../Common/Details/PortHierarchy/PortHierarchy";
import { ClientServerPortDetails } from "./ClientServerPortDetails/ClientServerPortDetails";
import { buildMemberComSpecDescriptions } from "./PortInterfaceComSpecHelper";
import { buildPortInterfaceDetailTables } from "./PortInterfaceDetailsHelper";
import { SenderReceiverPortDetails } from "./SenderReceiverPortDetails/SenderReceiverPortDetails";
import { formatPortDirectionLabel } from "../SwcDetails/PortDetails/CommunicationSpecHelper";

export function PortInterfaceDetails(props: {
  title: string;
  entity: AutosarEntity;
  modelEntities?: AutosarEntity[];
  referenceInstances: EntityReferenceInstance[];
  selectedInstancePath?: string;
  onReferenceInstanceSelect?: (instance: EntityReferenceInstance) => void;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
  breadcrumbs?: DetailBreadcrumb[];
}) {
  const metadata = props.entity.metadata ?? {};
  const details = props.entity.details?.entity ?? { fields: [], tables: [] };
  const interfaceMembers = props.entity.details?.interfaceMembers ?? [];
  const interfaceTables = buildPortInterfaceDetailTables(props.entity, interfaceMembers);
  const additionalTables = [...details.tables, ...interfaceTables];
  const memberCount = props.entity.interfaceKind === "client-server"
    ? interfaceMembers.filter((member) => member.kind === "operation").length
    : interfaceMembers.length;
  const comSpecsByMember = buildMemberComSpecDescriptions(
    interfaceMembers,
    props.referenceInstances,
    props.modelEntities ?? []
  );
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
    <DetailsBottomTabs
      title={props.title}
      contextKey={`${props.entity.id}:${props.selectedInstancePath ?? ""}`}
      breadcrumbs={props.breadcrumbs}
      initialTabId={props.selectedInstancePath ? "members" : "general"}
      renderTabContent={(content, tabId) => (
        <PortInterfaceHierarchy
          detailsFromInterface={tabId === "members"}
          interfaceName={props.entity.shortName}
          interfaceKind={props.entity.interfaceKind}
          portReferences={props.referenceInstances}
          onPortOpen={props.onReferenceInstanceSelect}
          formatPortType={(instanceType) => formatPortPrototypeInstanceType(instanceType, props.entity.interfaceKind)}
        >
          {content}
        </PortInterfaceHierarchy>
      )}
      tabs={[
        { id: "general", label: "General", content: (
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
        ) },
        { id: "members", label: "Members", count: memberCount, content: (
          <>
        {props.entity.interfaceKind === "sender-receiver" && (
          <SenderReceiverPortDetails
            members={interfaceMembers}
            entities={props.modelEntities}
            comSpecsByMember={comSpecsByMember}
            additionalTables={additionalTables}
            preferredMemberPath={props.selectedInstancePath}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        )}
        {props.entity.interfaceKind === "client-server" && (
          <ClientServerPortDetails
            members={interfaceMembers}
            entities={props.modelEntities}
            comSpecsByMember={comSpecsByMember}
            additionalTables={additionalTables}
            preferredMemberPath={props.selectedInstancePath}
            onOpenReferencedEntity={props.onOpenReferencedEntity}
            canOpenReferencedEntity={props.canOpenReferencedEntity}
          />
        )}
        {props.entity.interfaceKind !== "sender-receiver" &&
          props.entity.interfaceKind !== "client-server" && additionalTables.map((table) => (
          <EntityDetailTable key={table.title} table={table} />
        ))}
          </>
        ) }
      ]}
    />
  );
}

function formatPortPrototypeInstanceType(
  instanceType: string,
  interfaceKind: PortInterfaceKind | undefined
): string {
  const normalizedType = instanceType.toUpperCase();
  let direction: PortDirection;
  if (normalizedType === "P-PORT-PROTOTYPE") {
    direction = "provided";
  } else if (normalizedType === "R-PORT-PROTOTYPE") {
    direction = "required";
  } else if (normalizedType === "PR-PORT-PROTOTYPE") {
    direction = "provided-required";
  } else {
    return formatAutosarTagText(instanceType);
  }

  return `${formatPortDirectionLabel(direction, interfaceKind)} port prototype`;
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
