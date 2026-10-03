const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildPortConnectionLabels,
  getPortConnectionCategory,
  getFocusedNodeBounds,
  getFocusedNodeZoom,
  layoutVisibleSwcNode
} = require("../webview/src/components/AutosarEditor/AutosarSwc/AutosarSwcLayout.ts");

test("port interaction colors follow the same connection priority as edges", () => {
  assert.equal(getPortConnectionCategory(undefined), undefined);
  assert.equal(getPortConnectionCategory([{ category: "assembly" }]), "assembly");
  assert.equal(getPortConnectionCategory([{ category: "assembly" }, { category: "delegation" }]), "delegation");
  assert.equal(getPortConnectionCategory([{ category: "delegation" }, { category: "service" }]), "service");
});

test("delegation appears only on the inner SWC port, not the composition port prototype", () => {
  const graph = {
    nodes: [
      { id: "inner", label: "InnerSwc", ports: [{ id: "inner-port", label: "InnerPort" }] },
      { id: "composition", label: "OrbitCompositionOne", ports: [{ id: "outer-port", label: "StatusOut" }] }
    ],
    edges: [{
      id: "delegation",
      kind: "delegation",
      source: "inner",
      target: "composition",
      sourceHandle: "inner-port",
      targetHandle: "outer-port"
    }]
  };

  const labels = buildPortConnectionLabels(graph);
  assert.deepEqual(labels.inner["inner-port"], [{
    componentName: "OrbitCompositionOne",
    portName: "StatusOut",
    targetNodeId: "composition",
    targetPortId: "outer-port",
    category: "delegation"
  }]);
  assert.equal(labels.composition, undefined);
});

test("assembly connections still appear on both endpoints", () => {
  const graph = {
    nodes: [
      { id: "one", label: "One", ports: [{ id: "one-port", label: "Out" }] },
      { id: "two", label: "Two", ports: [{ id: "two-port", label: "In" }] }
    ],
    edges: [{
      id: "assembly",
      kind: "assembly",
      source: "one",
      target: "two",
      sourceHandle: "one-port",
      targetHandle: "two-port"
    }]
  };

  const labels = buildPortConnectionLabels(graph);
  assert.equal(labels.one["one-port"][0].componentName, "Two");
  assert.equal(labels.two["two-port"][0].componentName, "One");
});

test("canvas layout contains only the selected node and its own port edges", () => {
  const graph = {
    scope: "composition",
    nodes: [
      { id: "inner", kind: "instance", label: "InnerSwc", ports: [{ id: "inner-port", label: "InnerPort", direction: "required" }] },
      { id: "composition", kind: "composition", label: "OrbitCompositionOne", ports: [{ id: "outer-port", label: "StatusOut", direction: "required" }] }
    ],
    edges: [{
      id: "delegation",
      kind: "delegation",
      source: "inner",
      target: "composition",
      sourceHandle: "inner-port",
      targetHandle: "outer-port"
    }]
  };

  const layout = layoutVisibleSwcNode(graph, "inner");
  assert.deepEqual(layout.nodes.map((node) => node.id), ["inner"]);
  assert.ok(layout.edges.length > 0);
  assert.ok(layout.edges.every((edge) => edge.source === "inner" && edge.target === "inner"));
  assert.deepEqual(layout.nodes[0].position, { x: 0, y: 0 });
});

test("focused port bounds do not count connection rails twice", () => {
  const node = {
    data: {
      ports: [{ id: "port", direction: "required" }],
      portConnections: { port: [{ componentName: "A long composition label", portName: "OuterPort" }] }
    }
  };
  const bounds = getFocusedNodeBounds(node, { x: 0, y: 0 }, 1000, 400, "port");

  assert.equal(bounds.width, 1096);
  assert.ok(getFocusedNodeZoom({ width: 4000, height: 800 }, { width: 1200, height: 700 }, true) < 0.35);
});
