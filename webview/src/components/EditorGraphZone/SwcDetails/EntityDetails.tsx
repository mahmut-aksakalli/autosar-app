import type { AutosarEntity } from "../../../../../src/shared/contracts";
import { EntityDetailTable } from "./EntityDetailTable";
import {
  formatAutosarTagText,
  formatInitValueTypeOption,
  formatReferenceShortName,
  initValueTypeOptions,
  readBooleanMetadata
} from "./DetailsFormatters";
import { InitValueDisplay } from "./InitValueDisplay";
import {
  PortInterfaceDataElements,
  PortInterfaceOperations
} from "./PortInterfaceDetails/PortInterfaceDetails";
import { buildPortInterfaceDetailTables } from "./PortInterfaceDetails/PortInterfaceDetailsHelper";

export function EntityDetails(props: { title: string; entity: AutosarEntity }) {
  const metadata = props.entity.metadata ?? {};
  const details = props.entity.details?.entity ?? { fields: [], tables: [] };
  const interfaceMembers = props.entity.type === "interface"
    ? props.entity.details?.interfaceMembers ?? []
    : [];
  const interfaceTables = props.entity.type === "interface"
    ? buildPortInterfaceDetailTables(props.entity, interfaceMembers)
    : [];
  const interfaceType = details.fields.find((field) => field.label === "Interface Type")?.value ?? "-";
  const isService = details.fields.find((field) => field.label === "Is Service")?.value ?? "false";
  const fields = props.entity.type === "interface"
    ? [
        { label: "Name", value: props.entity.shortName },
        { label: "Port Interface Type", value: interfaceType },
        { label: "Package", value: props.entity.parentSemanticPath ?? props.entity.packagePath ?? "-" },
        { label: "Is Service", value: isService },
        { label: "Description", value: metadata.DESCRIPTION ?? "-" },
        ...details.fields.filter(
          (field) => field.label !== "Interface Type" && field.label !== "Is Service" && field.label !== "Service Kind"
        )
      ]
    : [
        { label: "Name", value: props.entity.shortName },
        { label: "AUTOSAR Type", value: formatAutosarTagText(props.entity.rawTagName) },
        { label: "Package Path", value: props.entity.parentSemanticPath ?? props.entity.packagePath ?? "-" },
        ...(metadata.DESCRIPTION ? [{ label: "Description", value: metadata.DESCRIPTION }] : []),
        ...details.fields
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
                {props.entity.type === "interface" && field.label === "Is Service" ? (
                  <input type="checkbox" checked={readBooleanMetadata(field.value) === true} disabled readOnly />
                ) : field.valueType ? (
                  <span className="model-inline-value-with-select">
                    <select value={formatInitValueTypeOption(field.valueType)} disabled>
                      {initValueTypeOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    <InitValueDisplay value={field.value} type={field.valueType} />
                  </span>
                ) : field.label === "Package Path" || field.label === "Package" ? field.value : field.value.startsWith("/") ? formatReferenceShortName(field.value) : field.value}
              </strong>
            </div>
          ))}
        </div>
        {props.entity.type === "interface" && props.entity.interfaceKind === "sender-receiver" ? (
          <PortInterfaceDataElements members={interfaceMembers} />
        ) : null}
        {props.entity.type === "interface" && props.entity.interfaceKind === "client-server" ? (
          <PortInterfaceOperations members={interfaceMembers} />
        ) : null}
        {[...details.tables, ...interfaceTables].map((table) => (
          <EntityDetailTable key={table.title} table={table} />
        ))}
      </div>
    </div>
  );
}
