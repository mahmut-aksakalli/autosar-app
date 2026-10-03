import type { EntityDetailPayload } from "../../../../../src/shared/contracts";
import type { DetailRelationshipNode } from "../../Common/Details/DetailRelationship/DetailRelationship";

/** Present each contained constraint rule as a child of its data constraint. */
export function getDataConstraintRuleNodes(details: EntityDetailPayload): DetailRelationshipNode[] {
  const ruleRows = details.tables.find((table) => table.title === "Constraint Rules")?.rows ?? [];

  return ruleRows.map((row) => {
    const kind = row.kind && row.kind !== "-" ? row.kind : "Unknown";
    const facts = [
      { label: "Lower limit", value: row.lower ?? "-" },
      { label: "Upper limit", value: row.upper ?? "-" }
    ];

    const additionalFacts = [
      { label: "Level", value: row.level },
      { label: "Scale constraints", value: row.scaleConstraints },
      { label: "Maximum gradient", value: row.maxGradient },
      { label: "Maximum difference", value: row.maxDifference },
      { label: "Monotony", value: row.monotony },
      { label: "Unit", value: row.unit }
    ];

    for (const fact of additionalFacts) {
      if (fact.value && fact.value !== "-") {
        facts.push({ label: fact.label, value: fact.value });
      }
    }

    return {
      role: `${kind} Data Constraint Rule`,
      name: "",
      facts
    };
  });
}
