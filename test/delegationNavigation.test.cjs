const assert = require("node:assert/strict");
const test = require("node:test");
const { getConnectionTreeNodeId, getDelegationNavigationTarget } = require("../webview/src/components/AutosarEditor/AutosarSwc/AutosarSwcNavigation.ts");

const root = { id: "root", type: "composition", semanticPath: "/Types/Root" };
const door = { id: "door-type", type: "composition", semanticPath: "/Types/Door" };
const doorInstance = {
  id: "door-instance",
  type: "instance",
  semanticPath: "/Types/Root/OrbitCompositionOne",
  parentSemanticPath: "/Types/Root"
};
const connection = { category: "delegation", targetNodeId: "door-type", targetPortId: "StatusOut" };

test("instance delegation reveals its parent composition instance and selects the port", () => {
  const target = getDelegationNavigationTarget(
    door,
    [root, door, doorInstance],
    [doorInstance.semanticPath],
    connection
  );

  assert.deepEqual(target, {
    entityId: "root",
    preferredScope: "composition",
    preferredNodeId: "door-instance",
    preferredPortId: "StatusOut",
    compositionContextPaths: [],
    compositionTreeOrigin: "root",
    treeNodeId: "root::door-instance"
  });
});

test("template delegation keeps the template name and reveals the template tree node", () => {
  const target = getDelegationNavigationTarget(door, [root, door, doorInstance], undefined, connection);

  assert.deepEqual(target, {
    entityId: "door-type",
    preferredScope: "composition",
    preferredNodeId: "door-type",
    preferredPortId: "StatusOut",
    compositionContextPaths: undefined,
    compositionTreeOrigin: "template",
    treeNodeId: "door-type"
  });
});

test("root occurrence delegation stays at the root port prototype", () => {
  const target = getDelegationNavigationTarget(root, [root], [], connection);

  assert.equal(target.treeNodeId, "root");
  assert.deepEqual(target.compositionContextPaths, []);
});

test("nested delegation keeps the parent occurrence chain", () => {
  const innerType = { id: "inner-type", type: "composition", semanticPath: "/Types/Inner" };
  const innerInstance = {
    id: "inner-instance",
    type: "instance",
    semanticPath: "/Types/Door/CpInner",
    parentSemanticPath: "/Types/Door"
  };
  const target = getDelegationNavigationTarget(
    innerType,
    [root, door, innerType, doorInstance, innerInstance],
    [doorInstance.semanticPath, innerInstance.semanticPath],
    connection
  );

  assert.equal(target.entityId, "door-type");
  assert.equal(target.preferredNodeId, "inner-instance");
  assert.deepEqual(target.compositionContextPaths, [doorInstance.semanticPath]);
  assert.equal(target.treeNodeId, `door-type:${doorInstance.semanticPath}:inner-instance`);
});

test("prototype opened under a template returns to that template branch", () => {
  const target = getDelegationNavigationTarget(
    door,
    [root, door, doorInstance],
    [doorInstance.semanticPath],
    connection,
    "template"
  );

  assert.equal(target.entityId, "root");
  assert.equal(target.preferredNodeId, "door-instance");
  assert.equal(target.compositionContextPaths, undefined);
  assert.equal(target.compositionTreeOrigin, "template");
  assert.equal(target.treeNodeId, "root:template:door-instance");
});

test("delegation to the root uses its instance branch even from a template tab", () => {
  const target = getDelegationNavigationTarget(
    door,
    [root, door, doorInstance],
    [doorInstance.semanticPath],
    connection,
    "template",
    root.id
  );

  assert.equal(target.treeNodeId, "root::door-instance");
  assert.equal(target.compositionTreeOrigin, "root");
  assert.deepEqual(target.compositionContextPaths, []);
});

test("connected-port navigation reveals authored and virtual instance tree nodes", () => {
  const authored = { id: "orbit-controller", kind: "instance" };
  const virtualService = { id: "beacon-service", kind: "instance" };
  const entities = [{ id: "orbit-controller", type: "instance" }];

  assert.equal(getConnectionTreeNodeId(root, authored, entities, [], "root"), "root::orbit-controller");
  assert.equal(getConnectionTreeNodeId(root, virtualService, entities, [], "root"), "root:service:beacon-service");
  assert.equal(getConnectionTreeNodeId(door, authored, entities, undefined, "template"), "door-type:template:orbit-controller");
});
