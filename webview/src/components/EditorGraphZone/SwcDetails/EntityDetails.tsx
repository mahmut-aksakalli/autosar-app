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
import { InterfaceDataElementsSection, InterfaceOperationsSection } from "./InterfaceDetails/InterfaceDetails";
import { buildInterfaceDetailTables } from "./InterfaceDetails/InterfaceDetailsHelper";

export function EntityDetails(props: { title: string; entity: AutosarEntity }) {
  const { title, entity } = props;
  const metadata = entity.metadata ?? {};
  const details = entity.details?.entity ?? { fields: [], tables: [] };
  const interfaceMembers = entity.type === "interface"
    ? entity.details?.interfaceMembers ?? []
    : [];
  const interfaceTables = entity.type === "interface"
    ? buildInterfaceDetailTables(entity, interfaceMembers)
    : [];
  const interfaceType = details.fields.find((field) => field.label === "Interface Type")?.value ?? "-";
  const isService = details.fields.find((field) => field.label === "Is Service")?.value ?? "false";
  const fields = entity.type === "interface"
    ? [
        { label: "Name", value: entity.shortName },
        { label: "Port Interface Type", value: interfaceType },
        { label: "Package", value: entity.parentSemanticPath ?? entity.packagePath ?? "-" },
        { label: "Is Service", value: isService },
        { label: "Description", value: metadata.DESCRIPTION ?? "-" },
        ...details.fields.filter(
          (field) => field.label !== "Interface Type" && field.label !== "Is Service" && field.label !== "Service Kind"
        )
      ]
    : [
        { label: "Name", value: entity.shortName },
        { label: "AUTOSAR Type", value: formatAutosarTagText(entity.rawTagName) },
        { label: "Package Path", value: entity.parentSemanticPath ?? entity.packagePath ?? "-" },
        ...(metadata.DESCRIPTION ? [{ label: "Description", value: metadata.DESCRIPTION }] : []),
        ...details.fields
      ];

  return (
    <div className="model-semantic-surface">
      <div className="model-semantic-header">
        <strong>{title}</strong>
      </div>
      <div className="model-port-detail">
        <div className="model-semantic-kv model-port-fields">
          {fields.map((field, index) => (
            <div key={`${field.label}:${index}`}>
              <span>{field.label}</span>
              <strong title={field.value}>
                {entity.type === "interface" && field.label === "Is Service" ? (
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
        {entity.type === "interface" && entity.interfaceKind === "sender-receiver" ? (
          <InterfaceDataElementsSection members={interfaceMembers} />
        ) : null}
        {entity.type === "interface" && entity.interfaceKind === "client-server" ? (
          <InterfaceOperationsSection members={interfaceMembers} />
        ) : null}
        {[...details.tables, ...interfaceTables].map((table) => (
          <EntityDetailTable key={table.title} table={table} />
        ))}
      </div>
    </div>
  );
}
