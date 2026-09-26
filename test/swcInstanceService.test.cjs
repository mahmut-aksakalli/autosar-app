const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSwcInstanceReferences, findUniqueCompositionContext } = require("../src/model/swcInstanceService.ts");

test("indexes every resolved instance of the same SWC across compositions", () => {
  const entities = [
    entity("swc-1", "swc", "DoorSwc", "/Components/DoorSwc"),
    entity("composition-1", "composition", "LeftComposition", "/Compositions/Left"),
    entity("composition-2", "composition", "RightComposition", "/Compositions/Right"),
    instance("left-door", "LeftDoor", "/Compositions/Left/LeftDoor", "/Compositions/Left", "/Components/DoorSwc"),
    instance("right-door", "RightDoor", "/Compositions/Right/RightDoor", "/Compositions/Right", "/Components/DoorSwc")
  ];

  const references = buildSwcInstanceReferences(entities);

  assert.equal(references.length, 2);
  assert.deepEqual(references.map((reference) => reference.instanceName), ["LeftDoor", "RightDoor"]);
  assert.equal(references[0].swcId, "swc-1");
  assert.equal(references[0].treeNodeId, "composition-1:left-door");
});

test("ignores instances with unresolved component types or parent compositions", () => {
  const entities = [
    instance("missing-type", "MissingType", "/Composition/MissingType", "/Composition", "/MissingSwc"),
    entity("swc-1", "swc", "DoorSwc", "/Components/DoorSwc"),
    instance("missing-parent", "MissingParent", "/Missing/MissingParent", "/Missing", "/Components/DoorSwc")
  ];

  assert.deepEqual(buildSwcInstanceReferences(entities), []);
});

test("resolves a unique nested composition occurrence for instance navigation", () => {
  const entities = [
    entity("root", "composition", "RootType", "/Types/Root"),
    entity("door", "composition", "OrbitCompositionType", "/Types/Door"),
    instance("door-prototype", "OrbitCompositionOne", "/Types/Root/OrbitCompositionOne", "/Types/Root", "/Types/Door")
  ];

  assert.deepEqual(
    findUniqueCompositionContext(entities, "root", "door"),
    ["/Types/Root/OrbitCompositionOne"]
  );
  assert.deepEqual(findUniqueCompositionContext(entities, "root", "root"), []);

  entities.push(instance("second-door", "SecondDoor", "/Types/Root/SecondDoor", "/Types/Root", "/Types/Door"));
  assert.equal(findUniqueCompositionContext(entities, "root", "door"), undefined);
});

function entity(id, type, shortName, semanticPath) {
  return { id, type, shortName, semanticPath, path: semanticPath, filePath: "model.arxml" };
}

function instance(id, shortName, semanticPath, parentSemanticPath, typeRef) {
  return {
    ...entity(id, "instance", shortName, semanticPath),
    parentSemanticPath,
    typeRef
  };
}
