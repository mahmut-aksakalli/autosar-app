const assert = require("node:assert/strict");
const test = require("node:test");
const { buildReferenceInstancesByTargetId } = require("../src/model/entityReferenceService.ts");

test("indexes a referenced definition with its nearest named usage", () => {
  const dataType = entity("type", "application-data-type", "VehicleSpeed", "/Types/VehicleSpeed");
  const portInterface = {
    ...entity("interface", "interface", "SpeedInterface", "/Interfaces/SpeedInterface"),
    references: [
      {
        target: "/Types/VehicleSpeed",
        role: "TYPE-TREF",
        contextName: "Speed",
        contextPath: "/Interfaces/SpeedInterface/Speed",
        contextType: "VARIABLE-DATA-PROTOTYPE"
      }
    ]
  };

  const index = buildReferenceInstancesByTargetId([dataType, portInterface]);

  assert.equal(index.type.length, 1);
  assert.equal(index.type[0].instanceName, "Speed");
  assert.equal(index.type[0].instanceType, "VARIABLE-DATA-PROTOTYPE");
  assert.equal(index.type[0].navigationEntityId, "interface");
});

test("uses the owning SWC for navigation and removes an ancestor duplicate for a port", () => {
  const portInterface = entity("interface", "interface", "SpeedInterface", "/Interfaces/SpeedInterface");
  const swc = {
    ...entity("swc", "swc", "SpeedConsumer", "/Components/SpeedConsumer"),
    references: [portReference()]
  };
  const port = {
    ...entity("port", "port", "SpeedIn", "/Components/SpeedConsumer/SpeedIn"),
    parentSemanticPath: "/Components/SpeedConsumer",
    references: [portReference()]
  };

  const index = buildReferenceInstancesByTargetId([portInterface, swc, port]);

  assert.equal(index.interface.length, 1);
  assert.equal(index.interface[0].portId, "port");
  assert.equal(index.interface[0].navigationEntityId, "swc");
});

function portReference() {
  return {
    target: "/Interfaces/SpeedInterface",
    role: "REQUIRED-INTERFACE-TREF",
    contextName: "SpeedIn",
    contextPath: "/Components/SpeedConsumer/SpeedIn",
    contextType: "R-PORT-PROTOTYPE"
  };
}

function entity(id, type, shortName, semanticPath) {
  return { id, type, shortName, semanticPath, path: semanticPath, filePath: "model.arxml" };
}
