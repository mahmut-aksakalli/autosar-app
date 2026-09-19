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

test("does not treat an included mode declaration group as an instance", () => {
  const modeGroup = entity(
    "mode-group",
    "mode-declaration-group",
    "PowerModeGroup",
    "/Modes/PowerModeGroup"
  );
  const behavior = {
    ...entity("behavior", "swc", "CoverageApplicationBehavior", "/Components/CoverageApplicationBehavior"),
    references: [
      {
        target: "/Modes/PowerModeGroup",
        role: "MODE-DECLARATION-GROUP-REF",
        contextName: "CoverageApplicationBehavior",
        contextPath: "/Components/CoverageApplicationBehavior",
        contextType: "SWC-INTERNAL-BEHAVIOR"
      }
    ]
  };
  const portInterface = {
    ...entity("interface", "interface", "PowerMode_I", "/Interfaces/PowerMode_I"),
    references: [
      {
        target: "/Modes/PowerModeGroup",
        role: "TYPE-TREF",
        contextName: "PowerMode",
        contextPath: "/Interfaces/PowerMode_I/PowerMode",
        contextType: "MODE-GROUP"
      }
    ]
  };

  const index = buildReferenceInstancesByTargetId([modeGroup, behavior, portInterface]);

  assert.equal(index["mode-group"].length, 1);
  assert.equal(index["mode-group"][0].instanceName, "PowerMode");
  assert.equal(index["mode-group"][0].referenceRole, "TYPE-TREF");
});

test("does not treat a data type inclusion as an instance", () => {
  const dataType = entity("type", "application-data-type", "VehicleSpeed", "/Types/VehicleSpeed");
  const behavior = {
    ...entity("behavior", "swc", "ApplicationBehavior", "/Components/ApplicationBehavior"),
    references: [
      {
        target: "/Types/VehicleSpeed",
        role: "DATA-TYPE-REF",
        contextName: "ApplicationBehavior",
        contextPath: "/Components/ApplicationBehavior",
        contextType: "SWC-INTERNAL-BEHAVIOR"
      }
    ]
  };
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

  const index = buildReferenceInstancesByTargetId([dataType, behavior, portInterface]);

  assert.equal(index.type.length, 1);
  assert.equal(index.type[0].instanceName, "Speed");
  assert.equal(index.type[0].referenceRole, "TYPE-TREF");
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
