const assert = require("node:assert/strict");
const test = require("node:test");
const { selectReferencedSupplementalTypes } = require("../src/model/supplementalTypeService.ts");

test("loads a referenced implementation type and its type details without unrelated entities", () => {
  const canonical = [{
    id: "interface",
    type: "interface",
    semanticPath: "/Interfaces/LampState",
    references: [{ target: "/Platform/ImplementationTypes/LampFlag", role: "TYPE-TREF" }]
  }];
  const implementationType = {
    id: "lamp-flag",
    type: "implementation-data-type",
    semanticPath: "/Platform/ImplementationTypes/LampFlag",
    references: [
      { target: "/Platform/BaseTypes/FlagBits", role: "BASE-TYPE-REF" },
      { target: "/Platform/CompuMethods/FlagText", role: "COMPU-METHOD-REF" },
      { target: "/Platform/Constraints/FlagRange", role: "DATA-CONSTR-REF" }
    ]
  };
  const candidates = [
    implementationType,
    { id: "duplicate-flag", type: "implementation-data-type", semanticPath: implementationType.semanticPath },
    { id: "flag-bits", type: "base-type", semanticPath: "/Platform/BaseTypes/FlagBits" },
    { id: "flag-text", type: "compu-method", semanticPath: "/Platform/CompuMethods/FlagText" },
    { id: "flag-range", type: "data-constraint", semanticPath: "/Platform/Constraints/FlagRange" },
    { id: "unrelated-type", type: "implementation-data-type", semanticPath: "/Platform/ImplementationTypes/Spare" },
    { id: "unrelated-swc", type: "swc", semanticPath: "/Components/Spare" }
  ];

  assert.deepEqual(
    selectReferencedSupplementalTypes(canonical, candidates).map((entity) => entity.id),
    ["lamp-flag", "flag-bits", "flag-text", "flag-range"]
  );
});
