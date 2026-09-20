const assert = require("node:assert/strict");
const test = require("node:test");
const { hydratePresentationDetails } = require("../src/model/presentationDetails.ts");

test("hydrates structured entity and inspector details outside the webview", () => {
  const entity = {
    id: "entity",
    type: "swc",
    shortName: "Example",
    path: "/Example",
    filePath: "example.arxml",
    metadata: {
      "ENTITY-DETAILS": JSON.stringify({ fields: [{ label: "Category", value: "Application" }], tables: [] })
    },
    inspector: {
      ownerLabel: "Example",
      sections: [{
        id: "runnables",
        label: "Runnables",
        items: [{
          id: "runnable",
          label: "Main",
          metadata: {
            "ACCESS-POINT-DETAILS": JSON.stringify([{ target: "Signal", access: "Read", name: "ReadSignal" }])
          }
        }]
      }]
    }
  };

  hydratePresentationDetails([entity]);

  assert.equal(entity.details.entity.fields[0].value, "Application");
  assert.equal(entity.inspector.sections[0].items[0].details.accessPoints[0].target, "Signal");
});

test("normalizes service assignment role names while hydrating", () => {
  const entity = {
    id: "entity",
    type: "swc",
    shortName: "Example",
    path: "/Example",
    filePath: "example.arxml",
    inspector: {
      ownerLabel: "Example",
      sections: [{
        id: "serviceDependencies",
        label: "Service Needs",
        items: [{
          id: "service",
          label: "NvM",
          metadata: {
            "ASSIGNED-DATA-DETAILS": JSON.stringify([{ role: "ramBlock", value: "RamData" }])
          }
        }]
      }]
    }
  };

  hydratePresentationDetails([entity]);

  assert.equal(entity.inspector.sections[0].items[0].details.assignedData[0].assignedRole, "ramBlock");
});
