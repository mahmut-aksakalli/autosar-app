const assert = require("node:assert/strict");
const test = require("node:test");
const { buildNestedServiceConnections, buildRootServiceExternalConnections } = require("../src/model/vectorEcuModelService.ts");

test("root service labels point back to the correct nested component occurrence", () => {
  const servicePath = "/Types/BeaconService";
  const flatServicePath = "/Flat/Beacon";
  const flatControllerPath = "/Flat/OrbitController";
  const secondFlatControllerPath = "/Flat/OrbitControllerTwo";
  const controllerPath = "/Types/OrbitComposition/OrbitController";
  const contextPath = "/Types/Root/OrbitCompositionOne";
  const secondContextPath = "/Types/Root/OrbitCompositionTwo";
  const servicePortPath = "/Types/BeaconService/StatusOut";
  const controllerPortPath = "/Types/OrbitController/StatusIn";
  const workspace = {
    entities: [
      { id: "service-type", type: "swc", swcKind: "service", semanticPath: servicePath },
      { id: "composition", type: "composition", semanticPath: "/Types/OrbitComposition" },
      { id: "controller", type: "instance", shortName: "OrbitController", semanticPath: controllerPath, parentSemanticPath: "/Types/OrbitComposition" },
      { id: "controller-port", type: "port", shortName: "StatusIn", semanticPath: controllerPortPath }
    ],
    vectorEcu: {
      flatEntities: [{ id: "beacon", type: "instance", shortName: "Beacon", semanticPath: flatServicePath, typeRef: servicePath }],
      instanceMappings: [
        { flatInstancePath: flatControllerPath, upstreamInstancePath: controllerPath, upstreamContextPaths: [contextPath] },
        { flatInstancePath: secondFlatControllerPath, upstreamInstancePath: controllerPath, upstreamContextPaths: [secondContextPath] }
      ],
      flatConnections: [
        { kind: "assembly", providerComponentRef: flatServicePath, requesterComponentRef: flatControllerPath, sourcePortRef: servicePortPath, targetPortRef: controllerPortPath },
        { kind: "assembly", providerComponentRef: flatServicePath, requesterComponentRef: secondFlatControllerPath, sourcePortRef: servicePortPath, targetPortRef: controllerPortPath }
      ]
    }
  };
  const nodes = new Map([["beacon", {
    id: "beacon",
    kind: "instance",
    ports: [{ id: "service-port", semanticPath: servicePortPath }]
  }]]);

  const labels = buildRootServiceExternalConnections(workspace, nodes);
  assert.deepEqual(labels[0], {
    nodeId: "beacon",
    portId: "service-port",
    componentName: "OrbitController",
    portName: "StatusIn",
    category: "service",
    targetCompositionId: "composition",
    targetCompositionContextPaths: [contextPath],
    targetTreeNodeId: `composition:${contextPath}:controller`,
    targetNodeId: "controller",
    targetPortId: "controller-port"
  });
  assert.equal(labels.length, 2);
  assert.deepEqual(labels[1].targetCompositionContextPaths, [secondContextPath]);
  assert.equal(labels[1].targetTreeNodeId, `composition:${secondContextPath}:controller`);
});

test("keeps service links separate for two instances of the same composition type", () => {
  const innerPortPath = "/Types/Inner/NeedService";
  const servicePortOne = "/Types/Service/ForOne";
  const servicePortTwo = "/Types/Service/ForTwo";
  const workspace = {
    entities: [
      { type: "swc", swcKind: "service", semanticPath: "/Types/Service" },
      { id: "one-port", type: "port", shortName: "ForOne", semanticPath: servicePortOne },
      { id: "two-port", type: "port", shortName: "ForTwo", semanticPath: servicePortTwo }
    ],
    vectorEcu: {
      rootCompositionId: "root",
      instanceMappings: [
        { flatInstancePath: "/Flat/InnerOne", upstreamInstancePath: "/Types/Composition/Inner", upstreamContextPaths: ["/Root/One"] },
        { flatInstancePath: "/Flat/InnerTwo", upstreamInstancePath: "/Types/Composition/Inner", upstreamContextPaths: ["/Root/Two"] }
      ],
      flatEntities: [
        { id: "service", type: "instance", shortName: "Service", semanticPath: "/Flat/Service", typeRef: "/Types/Service" }
      ],
      flatConnections: [
        { kind: "assembly", providerComponentRef: "/Flat/Service", requesterComponentRef: "/Flat/InnerOne", sourcePortRef: servicePortOne, targetPortRef: innerPortPath },
        { kind: "assembly", providerComponentRef: "/Flat/Service", requesterComponentRef: "/Flat/InnerTwo", sourcePortRef: servicePortTwo, targetPortRef: innerPortPath }
      ]
    }
  };
  const nodes = new Map([["inner", {
    id: "inner",
    kind: "instance",
    semanticPath: "/Types/Composition/Inner",
    ports: [{ id: "inner-port", semanticPath: innerPortPath }]
  }]]);

  const first = buildNestedServiceConnections(workspace, nodes, ["/Root/One"]);
  const second = buildNestedServiceConnections(workspace, nodes, ["/Root/Two"]);

  assert.deepEqual(first.map((connection) => connection.portName), ["ForOne"]);
  assert.deepEqual(second.map((connection) => connection.portName), ["ForTwo"]);
  assert.deepEqual(buildNestedServiceConnections(workspace, nodes, ["/Root/Unknown"]), []);
});
