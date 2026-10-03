const assert = require("node:assert/strict");
const test = require("node:test");
const { getDataConstraintRuleNodes } = require("../webview/src/components/AutosarEditor/EntityDetails/DataConstraintRules.ts");

test("shows internal and physical constraint rules with their ranges", () => {
  const nodes = getDataConstraintRuleNodes({
    fields: [],
    tables: [{
      title: "Constraint Rules",
      columns: [],
      rows: [
        { rule: "1", kind: "Internal", lower: "0", upper: "255", level: "2", maxGradient: "10" },
        { rule: "1", kind: "Physical", lower: "-40", upper: "125", unit: "/Units/Celsius" }
      ]
    }]
  });

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].role, "Internal Data Constraint Rule");
  assert.equal(nodes[0].name, "");
  assert.deepEqual(nodes[0].facts, [
    { label: "Lower limit", value: "0" },
    { label: "Upper limit", value: "255" },
    { label: "Level", value: "2" },
    { label: "Maximum gradient", value: "10" }
  ]);
  assert.equal(nodes[1].role, "Physical Data Constraint Rule");
  assert.equal(nodes[1].name, "");
  assert.deepEqual(nodes[1].facts.slice(0, 2), [
    { label: "Lower limit", value: "-40" },
    { label: "Upper limit", value: "125" }
  ]);
  assert.deepEqual(nodes[1].facts.at(-1), { label: "Unit", value: "/Units/Celsius" });
});
