const assert = require("node:assert/strict");
const test = require("node:test");
const { getUnitRelationshipTargets } = require("../webview/src/components/AutosarEditor/EntityDetails/UnitRelationship.ts");

test("shows unit conversion properties and retains its physical dimension reference", () => {
  const targets = getUnitRelationshipTargets({
    fields: [
      { label: "Display Name", value: "degrees" },
      { label: "Factor SI to Unit", value: "0.5" },
      { label: "Offset SI to Unit", value: "4" },
      { label: "Physical Dimension", value: "/Dimensions/Angle" }
    ],
    tables: []
  });

  assert.deepEqual(targets[0].facts, [
    { label: "Display name", value: "degrees", wide: true },
    { label: "Factor SI to unit", value: "0.5" },
    { label: "Offset SI to unit", value: "4" }
  ]);
  assert.equal(targets[1].name, "Angle");
  assert.equal(targets[1].referencePath, "/Dimensions/Angle");
});
