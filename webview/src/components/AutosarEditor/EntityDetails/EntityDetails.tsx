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
import { getDataConstraintRuleNodes } from "./DataConstraintRules";
import { getUnitRelationshipTargets } from "./UnitRelationship";
import { ImplementationTypeDeclaration } from "./ImplementationTypeDeclaration/ImplementationTypeDeclaration";

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
  const isConstant = props.entity.type === "constant";
  const isDataConstraint = props.entity.type === "data-constraint";
  const isUnit = props.entity.type === "unit";
  const isModeDeclarationGroup = props.entity.type === "mode-declaration-group";
  const isImplementationType = props.entity.type === "implementation-data-type";
  const implementationType = isImplementationType ? details.implementationType : undefined;
  const implementationCategory = isImplementationType
    ? implementationType?.category ?? details.fields.find((field) => field.label === "Category")?.value
    : undefined;
  const showImplementationDeclaration = Boolean(
    implementationType && ["STRUCTURE", "UNION", "ARRAY"].includes(implementationCategory?.toUpperCase() ?? "")
  );
  const isChainOnly = isConstant || isDataConstraint || isUnit || isImplementationType || isModeDeclarationGroup;
  const showReferencingBranches = DATA_TYPE_ENTITY_TYPES.has(props.entity.type) || isConstant || isModeDeclarationGroup;
  const referencingBranches = showReferencingBranches
    ? [...(props.referenceInstances ?? [])]
      .sort((left, right) =>
        left.referencingObjectName.localeCompare(right.referencingObjectName) ||
        left.instanceName.localeCompare(right.instanceName)
      )
      .map((instance) => ({
        role: `${formatAutosarTagText(instance.instanceType)} of ${instance.referencingObjectName}`,
        name: instance.instanceName,
        symbolType: isModeDeclarationGroup ? "mode" : undefined,
        onClick: props.onReferenceInstanceSelect
          ? () => props.onReferenceInstanceSelect?.(instance)
          : undefined
      }))
    : undefined;
  const referenceFields: DetailRelationshipNode[] = details.fields
    .map((field) => referenceRelationship(field.label, field.value.startsWith("/") ? field.value : undefined))
    .filter((reference) => reference !== undefined);
  const implementationReferences = implementationType
    ? implementationType.references
      .map((reference) => referenceRelationship(reference.label, reference.path))
      .filter((reference) => reference !== undefined)
    : [];
  const implementationFacts = isImplementationType ? [
    ...(packagePath ? [{ label: "Package Path", value: packagePath, wide: true }] : []),
    ...(metadata.DESCRIPTION ? [{ label: "Description", value: metadata.DESCRIPTION, wide: true }] : []),
    ...details.fields
      .filter((field) => field.label !== "Category" && field.value !== "-" && !field.value.startsWith("/"))
      .map((field) => ({ label: field.label, value: field.value }))
  ] : undefined;
  const modeGroupFacts = isModeDeclarationGroup ? [
    ...(packagePath ? [{ label: "Package Path", value: packagePath, wide: true }] : []),
    ...(metadata.DESCRIPTION ? [{ label: "Description", value: metadata.DESCRIPTION, wide: true }] : []),
    ...details.fields
      .filter((field) => field.label !== "Initial Mode" && field.value !== "-" && !field.value.startsWith("/"))
      .map((field) => ({ label: field.label, value: field.value })),
    ...(details.tables.find((table) => table.title === "Transitions")?.rows ?? [])
      .map((transition, index) => ({
        label: `Transition ${index + 1}`,
        value: `${formatReferenceShortName(transition.exited ?? "-")} → ${formatReferenceShortName(transition.entered ?? "-")}`
      }))
  ] : undefined;
  let relationshipTargets = referenceFields;
  if (implementationType) {
    relationshipTargets = showImplementationDeclaration ? [] : implementationReferences;
  }
  let targetLink = "references";
  if (isConstant) {
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
  } else if (isDataConstraint) {
    targetLink = "has rules";
    relationshipTargets = getDataConstraintRuleNodes(details);
  } else if (isUnit) {
    targetLink = "has properties";
    relationshipTargets = getUnitRelationshipTargets(details);
  } else if (isModeDeclarationGroup) {
    targetLink = "has modes";
    const initialMode = details.fields.find((field) => field.label === "Initial Mode")?.value;
    const modes = details.tables.find((table) => table.title === "Modes")?.rows ?? [];
    relationshipTargets = modes.map((mode) => {
      const isInitial = Boolean(initialMode && formatReferenceShortName(initialMode) === mode.name);
      return {
        role: isInitial ? "Initial Mode" : "Mode",
        name: mode.name ?? "-",
        inlineValue: mode.value && mode.value !== "-" ? mode.value : undefined,
        highlight: isInitial ? "initial-mode" as const : undefined
      };
    });
    if (relationshipTargets.length === 0) {
      relationshipTargets = referenceFields;
    }
  }

  const tabs: DetailsTab[] = [
    { id: "general", label: "General", content: isChainOnly ? null : (
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
  if (!isImplementationType && !isModeDeclarationGroup && details.tables.length > 0 && !isDataConstraint) {
    tabs.push({
      id: "members",
      label: "Members",
      count: details.tables.reduce((total, table) => total + table.rows.length, 0),
      content: details.tables.map((table) => <EntityDetailTable key={table.title} table={table} />)
    });
  }
  if (props.referenceInstances && !showReferencingBranches && !isModeDeclarationGroup) {
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
          sourceHeading={isModeDeclarationGroup
            ? "Instances referencing this mode declaration group"
            : `Instances referencing this ${isConstant ? "constant" : isDataConstraint ? "data constraint" : isUnit ? "unit" : "data type"}`}
          sourceEmptyText={isModeDeclarationGroup ? "No referencing mode group instances discovered." : undefined}
          sourceLink={isModeDeclarationGroup ? "reference" : undefined}
          current={{
            role: formatAutosarTagText(props.entity.rawTagName),
            name: props.entity.shortName,
            badge: implementationCategory?.replaceAll("_", " "),
            facts: implementationFacts ?? modeGroupFacts
          }}
          targets={relationshipTargets}
          targetLink={targetLink}
          compactTargets={DATA_TYPE_ENTITY_TYPES.has(props.entity.type)}
          memberContent={showImplementationDeclaration && implementationType ? (
            <ImplementationTypeDeclaration
              name={props.entity.shortName}
              detail={implementationType}
              onOpenReference={props.onOpenReferencedEntity}
              canOpenReference={props.canOpenReferencedEntity}
            />
          ) : undefined}
          showDetailsLink={!isChainOnly}
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
