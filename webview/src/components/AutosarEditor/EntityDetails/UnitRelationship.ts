import type { EntityDetailPayload } from "../../../../../src/shared/contracts";
import type { DetailRelationshipNode } from "../../Common/Details/DetailRelationship/DetailRelationship";

/** Keep the unit's numerical conversion visible without a separate property panel. */
export function getUnitRelationshipTargets(details: EntityDetailPayload): DetailRelationshipNode[] {
  const fieldValue = (label: string) => details.fields.find((field) => field.label === label)?.value ?? "-";
  const targets: DetailRelationshipNode[] = [{
    role: "Unit Properties",
    name: "",
    facts: [
      { label: "Display name", value: fieldValue("Display Name"), wide: true },
      { label: "Factor SI to unit", value: fieldValue("Factor SI to Unit") },
      { label: "Offset SI to unit", value: fieldValue("Offset SI to Unit") }
    ]
  }];

  const dimensionPath = fieldValue("Physical Dimension");
  if (dimensionPath.startsWith("/")) {
    targets.push({
      role: "Physical Dimension",
      name: dimensionPath.split("/").filter(Boolean).at(-1) ?? dimensionPath,
      referencePath: dimensionPath
    });
  }

  return targets;
}
