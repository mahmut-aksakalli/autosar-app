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
import { DetailsBottomTabs, type DetailBreadcrumb, type DetailsTab } from "../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";

export function EntityDetails(props: {
  title: string;
  entity: AutosarEntity;
  referenceInstances?: EntityReferenceInstance[];
  onReferenceInstanceSelect?: (instance: EntityReferenceInstance) => void;
  breadcrumbs?: DetailBreadcrumb[];
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

  const tabs: DetailsTab[] = [
    { id: "general", label: "General", content: (
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
    ) }
  ];
  if (details.tables.length > 0) {
    tabs.push({
      id: "members",
      label: "Members",
      count: details.tables.reduce((total, table) => total + table.rows.length, 0),
      content: details.tables.map((table) => <EntityDetailTable key={table.title} table={table} />)
    });
  }
  if (props.referenceInstances) {
    tabs.push({
      id: "instances",
      label: "Instances",
      count: props.referenceInstances.length,
      content: <ReferenceInstancesTable
        instances={props.referenceInstances}
        onInstanceSelect={props.onReferenceInstanceSelect}
      />
    });
  }

  return (
    <DetailsBottomTabs title={props.title} contextKey={props.entity.id} breadcrumbs={props.breadcrumbs} tabs={tabs} />
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
