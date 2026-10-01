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
import { DetailRelationship, referenceRelationship, type DetailRelationshipNode } from "../../Common/Details/DetailRelationship/DetailRelationship";
import { DetailGeneralPanel } from "../../Common/Details/DetailGeneralPanel/DetailGeneralPanel";

const DATA_TYPE_ENTITY_TYPES = new Set([
  "application-data-type",
  "implementation-data-type",
  "base-type",
  "unit",
  "compu-method",
  "data-constraint",
  "record-layout"
]);

export function EntityDetails(props: {
  title: string;
  entity: AutosarEntity;
  referenceInstances?: EntityReferenceInstance[];
  onReferenceInstanceSelect?: (instance: EntityReferenceInstance) => void;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
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
  const packagePath = props.entity.parentSemanticPath ?? props.entity.packagePath;
  const showReferencingBranches = DATA_TYPE_ENTITY_TYPES.has(props.entity.type) || props.entity.type === "constant";
  const referencingBranches = showReferencingBranches
    ? [...(props.referenceInstances ?? [])]
      .sort((left, right) =>
        left.referencingObjectName.localeCompare(right.referencingObjectName) ||
        left.instanceName.localeCompare(right.instanceName)
      )
      .map((instance) => ({
        role: `${formatAutosarTagText(instance.instanceType)} of ${instance.referencingObjectName}`,
        name: instance.instanceName,
        onClick: props.onReferenceInstanceSelect
          ? () => props.onReferenceInstanceSelect?.(instance)
          : undefined
      }))
    : undefined;
  const referenceFields: DetailRelationshipNode[] = details.fields
    .map((field) => referenceRelationship(field.label, field.value.startsWith("/") ? field.value : undefined))
    .filter((reference) => reference !== undefined);
  let relationshipTargets = referenceFields;
  let targetLink = "references";
  if (props.entity.type === "constant") {
    targetLink = "has value";
    const valueReference = referenceRelationship("Value Reference", metadata["VALUE-SPEC-REF"]);
    if (valueReference) {
      relationshipTargets = [valueReference];
    } else if (metadata["VALUE-SPEC"] && metadata["VALUE-SPEC"] !== "-") {
      relationshipTargets = [{
        role: metadata["VALUE-SPEC-TYPE"] && metadata["VALUE-SPEC-TYPE"] !== "-"
          ? formatAutosarTagText(metadata["VALUE-SPEC-TYPE"])
          : "Value",
        name: metadata["VALUE-SPEC"],
        valueType: metadata["VALUE-SPEC-TYPE"] ?? "-"
      }];
    }
  } else if (props.entity.type === "mode-declaration-group") {
    targetLink = "has modes";
    const initialMode = details.fields.find((field) => field.label === "Initial Mode")?.value;
    const modes = details.tables.find((table) => table.title === "Modes")?.rows ?? [];
    relationshipTargets = modes.map((mode) => ({
      role: initialMode && formatReferenceShortName(initialMode) === mode.name ? "Initial Mode" : "Mode",
      name: mode.name ?? "-"
    }));
    if (relationshipTargets.length === 0) {
      relationshipTargets = referenceFields;
    }
  }

  const tabs: DetailsTab[] = [
    { id: "general", label: "General", content: (
      <DetailGeneralPanel>
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
      </DetailGeneralPanel>
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
  if (props.referenceInstances && !showReferencingBranches) {
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
    <DetailsBottomTabs
      title={props.title}
      contextKey={props.entity.id}
      breadcrumbs={props.breadcrumbs}
      topContent={
        <DetailRelationship
          align={showReferencingBranches ? "left" : "center"}
          source={!showReferencingBranches && packagePath ? {
            role: "Package",
            name: formatReferenceShortName(packagePath),
            referencePath: packagePath
          } : undefined}
          sourceBranches={referencingBranches}
          sourceHeading={`Instances referencing this ${props.entity.type === "constant" ? "constant" : "data type"}`}
          current={{ role: formatAutosarTagText(props.entity.rawTagName), name: props.entity.shortName }}
          targets={relationshipTargets}
          targetLink={targetLink}
          onOpenReference={props.onOpenReferencedEntity}
          canOpenReference={props.canOpenReferencedEntity}
        />
      }
      tabs={tabs}
    />
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
