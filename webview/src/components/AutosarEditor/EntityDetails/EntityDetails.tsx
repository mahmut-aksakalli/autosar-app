import type {
  AutosarEntity,
  EntityReferenceInstance
} from "../../../../../src/shared/contracts";
import { ReferenceInstancesTable } from "../../Common/Table/ReferenceInstancesTable";
import { EntityDetailTable } from "../../Common/Table/EntityDetailTable";
import {
  formatAutosarTagText,
  formatInitValueTypeOption,
  formatReferenceShortName,
  initValueTypeOptions
} from "../../Common/Details/DetailsFormatters";
import { InitValueDisplay } from "../../Common/Details/InitValueDisplay";

export function EntityDetails(props: {
  title: string;
  entity: AutosarEntity;
  referenceInstances?: EntityReferenceInstance[];
  onReferenceInstanceSelect?: (instance: EntityReferenceInstance) => void;
}) {
  const metadata = props.entity.metadata ?? {};
  const details = props.entity.details?.entity ?? { fields: [], tables: [] };
  const fields = [
    { label: "Name", value: props.entity.shortName },
    { label: "AUTOSAR Type", value: formatAutosarTagText(props.entity.rawTagName) },
    {
      label: "Package Path",
      value: props.entity.parentSemanticPath ?? props.entity.packagePath ?? "-"
    },
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
                <EntityFieldValue field={field} />
              </strong>
            </div>
          ))}
        </div>
        {props.referenceInstances && (
          <ReferenceInstancesTable
            instances={props.referenceInstances}
            onInstanceSelect={props.onReferenceInstanceSelect}
          />
        )}
        {details.tables.map((table) => (
          <EntityDetailTable key={table.title} table={table} />
        ))}
      </div>
    </div>
  );
}

function EntityFieldValue(props: {
  field: { label: string; value: string; valueType?: string };
}) {
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

  if (props.field.label === "Package Path") {
    return props.field.value;
  }

  if (props.field.value.startsWith("/")) {
    return formatReferenceShortName(props.field.value);
  }

  return props.field.value;
}
