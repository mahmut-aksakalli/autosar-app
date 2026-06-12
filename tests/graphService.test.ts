import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { WorkspaceSnapshot } from "../src/shared/contracts.js";
import { buildAutosarModel } from "../electron/services/autosarModel.js";
import { GraphService } from "../electron/services/graphService.js";
import { layoutSwcGraph } from "../src/model/graphLayout.js";

function createGraphService(snapshot: WorkspaceSnapshot) {
  return new GraphService({
    getSnapshot: () => snapshot
  } as never);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

const snapshot: WorkspaceSnapshot = {
  rootPath: "C:/workspace",
  files: [],
  explorerEntries: [],
  watched: true,
  lastIndexedAt: new Date().toISOString(),
  entities: [
    {
      id: "composition",
      type: "composition",
      shortName: "RootComposition",
      path: "/Pkg/RootComposition",
      filePath: "C:/workspace/model.arxml",
      xmlPath: "/AUTOSAR/AR-PACKAGES/AR-PACKAGE/ELEMENTS/COMPOSITION-SW-COMPONENT-TYPE",
      semanticPath: "/Pkg/RootComposition"
    },
    {
      id: "outer-port",
      type: "port",
      shortName: "ExportedData",
      path: "/Pkg/RootComposition/ExportedData",
      filePath: "C:/workspace/model.arxml",
      xmlPath: "/AUTOSAR/.../ExportedData",
      semanticPath: "/Pkg/RootComposition/ExportedData",
      parentSemanticPath: "/Pkg/RootComposition",
      portDirection: "provided",
      typeRef: "/Pkg/Interfaces/DataIf"
    },
    {
      id: "instance",
      type: "instance",
      shortName: "SenderInst",
      path: "/Pkg/RootComposition/SenderInst",
      filePath: "C:/workspace/model.arxml",
      xmlPath: "/AUTOSAR/.../SenderInst",
      semanticPath: "/Pkg/RootComposition/SenderInst",
      parentSemanticPath: "/Pkg/RootComposition",
      typeRef: "/Pkg/SenderSwc"
    },
    {
      id: "swc",
      type: "swc",
      shortName: "SenderSwc",
      path: "/Pkg/SenderSwc",
      filePath: "C:/workspace/model.arxml",
      xmlPath: "/AUTOSAR/.../SenderSwc",
      semanticPath: "/Pkg/SenderSwc",
      inspector: {
        ownerId: "swc",
        ownerLabel: "SenderSwc",
        ownerSemanticPath: "/Pkg/SenderSwc",
        sections: [
          {
            id: "runnables",
            label: "Runnables",
            items: [{ id: "run-1", label: "Step" }]
          },
          {
            id: "calibrationVariables",
            label: "Calibration Variables",
            items: []
          },
          {
            id: "interRunnableVariables",
            label: "Inter-runnable Variables",
            items: []
          },
          {
            id: "perInstanceMemory",
            label: "Per-instance Memory",
            items: [{ id: "pim-1", label: "Counter" }]
          }
        ]
      }
    },
    {
      id: "swc-port",
      type: "port",
      shortName: "DataOut",
      path: "/Pkg/SenderSwc/DataOut",
      filePath: "C:/workspace/model.arxml",
      xmlPath: "/AUTOSAR/.../DataOut",
      semanticPath: "/Pkg/SenderSwc/DataOut",
      parentSemanticPath: "/Pkg/SenderSwc",
      portDirection: "provided",
      typeRef: "/Pkg/Interfaces/DataIf",
      metadata: {
        "COMMUNICATION-SPEC-DETAILS": JSON.stringify([
          {
            index: "1",
            dataElement: "/Pkg/Interfaces/DataIf/Signal",
            comSpec: "Nonqueued Sender Com Spec",
            initValue: "-"
          }
        ])
      }
    },
    {
      id: "interface",
      type: "interface",
      shortName: "DataIf",
      path: "/Pkg/Interfaces/DataIf",
      filePath: "C:/workspace/interfaces.arxml",
      xmlPath: "/AUTOSAR/.../DataIf",
      semanticPath: "/Pkg/Interfaces/DataIf",
      interfaceKind: "sender-receiver",
      metadata: {
        "INTERFACE-DATA-ELEMENT-DETAILS": JSON.stringify([
          {
            label: "Signal",
            semanticPath: "/Pkg/Interfaces/DataIf/Signal",
            metadata: {
              TYPE: "/Pkg/DataTypes/uint8",
              "SW-CALIBRATION-ACCESS": "READ-WRITE"
            }
          }
        ])
      }
    }
  ],
  connections: [
    {
      id: "delegation",
      from: "/Pkg/SenderSwc/DataOut",
      to: "/Pkg/RootComposition/ExportedData",
      label: "ExportSignal",
      filePath: "C:/workspace/model.arxml",
      kind: "delegation",
      xmlPath: "/AUTOSAR/.../DELEGATION-SW-CONNECTOR",
      providerComponentRef: "/Pkg/RootComposition/SenderInst",
      sourcePortRef: "/Pkg/SenderSwc/DataOut",
      outerPortRef: "/Pkg/RootComposition/ExportedData"
    }
  ]
};

test("buildGraph returns SWC detail node with explicit ports", async () => {
  const graphService = createGraphService(snapshot);
  const graph = await graphService.buildGraph({
    scope: "swc",
    focusId: "/Pkg/SenderSwc",
    depth: 1
  });

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]?.kind, "swc");
  assert.equal(graph.nodes[0]?.ports[0]?.label, "DataOut");
  const communicationSpecDetails = JSON.parse(
    graph.nodes[0]?.ports[0]?.metadata?.["COMMUNICATION-SPEC-DETAILS"] ?? "[]"
  ) as Array<Record<string, string>>;
  assert.equal(communicationSpecDetails[0]?.dataType, "/Pkg/DataTypes/uint8");
  assert.equal(communicationSpecDetails[0]?.measurementCalibration, "READ-WRITE");
  assert.equal(graph.nodes[0]?.inspector?.sections[0]?.items[0]?.label, "Step");
  assert.equal(graph.edges.length, 0);
});

test("buildGraph returns composition node without expanding child SWCs", async () => {
  const graphService = createGraphService(snapshot);
  const graph = await graphService.buildGraph({
    scope: "composition",
    focusId: "/Pkg/RootComposition",
    depth: 1
  });

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]?.kind, "composition");
  assert.equal(graph.nodes[0]?.label, "RootComposition");
  assert.equal(graph.nodes[0]?.ports[0]?.label, "ExportedData");
  assert.equal(graph.nodes.some((node) => node.kind === "instance"), false);
  assert.equal(graph.edges.length, 0);
});

test("buildGraph expands composition wiring for selected child instances", async () => {
  const graphService = createGraphService(snapshot);
  const graph = await graphService.buildGraph({
    scope: "composition",
    focusId: "/Pkg/RootComposition",
    depth: 1,
    includeCompositionInternals: true
  });

  assert.equal(graph.nodes.some((node) => node.kind === "composition" && node.label === "RootComposition"), true);
  assert.equal(graph.nodes.some((node) => node.kind === "instance" && node.label === "SenderInst"), true);
  assert.equal(graph.nodes.find((node) => node.kind === "composition")?.ports[0]?.label, "ExportedData");
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.kind, "delegation");
  assert.equal(graph.edges[0]?.sourceHandle, "swc-port");
  assert.equal(graph.edges[0]?.targetHandle, "outer-port");
  assert.equal(graph.edges[0]?.target, "composition");
  assert.equal(
    graph.nodes.find((node) => node.kind === "instance")?.inspector?.ownerLabel,
    "SenderInst (SenderSwc)"
  );
});

test("buildGraph carries Step 3 SWC and PR port semantics from the standards fixture", async () => {
  const fixtureXml = fs.readFileSync(path.join(process.cwd(), "examples", "example-ecu-project.arxml"), "utf8");
  const model = buildAutosarModel("C:/workspace/example-ecu-project.arxml", parser.parse(fixtureXml));
  const fixtureSnapshot: WorkspaceSnapshot = {
    rootPath: "C:/workspace",
    files: [],
    explorerEntries: [],
    watched: true,
    lastIndexedAt: new Date().toISOString(),
    entities: model.entities,
    connections: model.connections
  };

  const graphService = createGraphService(fixtureSnapshot);
  const swcGraph = await graphService.buildGraph({
    scope: "swc",
    focusId: "/ExampleEcuProject/StandardsCoverage/Components/CoverageApplicationSwc",
    depth: 1
  });
  const swcNode = swcGraph.nodes[0];
  const prPort = swcNode?.ports.find((port) => port.label === "WakeupDataPr");

  assert.equal(swcNode?.swcKind, "application");
  assert.equal(prPort?.direction, "provided-required");
  assert.equal(prPort?.portKind, "provided-required");
  assert.equal(prPort?.interfaceKind, "nv-data");
  assert.equal(
    swcNode?.inspector?.sections.find((section) => section.id === "interfaceTriggers")?.items.some((item) => item.label === "FastWakeup"),
    true
  );

  const compositionGraph = await graphService.buildGraph({
    scope: "composition",
    focusId: "/ExampleEcuProject/StandardsCoverage/Components/StandardsCoverageComposition",
    depth: 1,
    includeCompositionInternals: true
  });

  assert.equal(
    compositionGraph.nodes.find((node) => node.kind === "instance" && node.label === "EcuAbsInst")?.swcKind,
    "ecu-abstraction"
  );
  assert.equal(
    compositionGraph.nodes.find((node) => node.kind === "instance" && node.label === "ComplexDriverInst")?.swcKind,
    "complex-device-driver"
  );
  assert.deepEqual(
    compositionGraph.nodes.find((node) => node.kind === "composition" && node.label === "StandardsCoverageComposition")?.ports.map(
      (port) => port.label
    ),
    ["DiagAdminSrv", "PowerModeOut", "VehicleSpeedOut", "WakeupStatusOut"]
  );
});

test("layoutSwcGraph keeps standards composition ports on the composition boundary", async () => {
  const fixtureXml = fs.readFileSync(path.join(process.cwd(), "examples", "example-ecu-project.arxml"), "utf8");
  const model = buildAutosarModel("C:/workspace/example-ecu-project.arxml", parser.parse(fixtureXml));
  const fixtureSnapshot: WorkspaceSnapshot = {
    rootPath: "C:/workspace",
    files: [],
    explorerEntries: [],
    watched: true,
    lastIndexedAt: new Date().toISOString(),
    entities: model.entities,
    connections: model.connections
  };

  const graphService = createGraphService(fixtureSnapshot);
  const compositionGraph = await graphService.buildGraph({
    scope: "composition",
    focusId: "/ExampleEcuProject/StandardsCoverage/Components/StandardsCoverageComposition",
    depth: 1,
    includeCompositionInternals: true
  });
  const flowGraph = layoutSwcGraph(compositionGraph);
  const nodePositionByLabel = new Map(
    flowGraph.nodes.map((node) => [String(node.data.label), node.position.y])
  );
  const nodeByLabel = new Map(
    flowGraph.nodes.map((node) => [String(node.data.label), node])
  );

  assert.equal(nodePositionByLabel.get("CalibrationInst")! < nodePositionByLabel.get("ServiceInst")!, true);
  assert.equal(nodePositionByLabel.get("ServiceInst")! < nodePositionByLabel.get("ProxyInst")!, true);
  assert.equal(nodePositionByLabel.get("ProxyInst")! < nodePositionByLabel.get("NvBlockInst")!, true);
  assert.equal(nodePositionByLabel.get("NvBlockInst")! < nodePositionByLabel.get("SensorInst")!, true);
  assert.equal(nodePositionByLabel.get("SensorInst")! < nodePositionByLabel.get("EcuAbsInst")!, true);
  assert.equal(nodePositionByLabel.get("EcuAbsInst")! < nodePositionByLabel.get("ComplexDriverInst")!, true);
  assert.equal(nodePositionByLabel.get("ComplexDriverInst")! < nodePositionByLabel.get("ApplicationInst")!, true);
  assert.equal(flowGraph.nodes.some((node) => String(node.data.label) === "StandardsCoverageComposition"), true);
  assert.equal(flowGraph.nodes.some((node) => String(node.data.label) === "VehicleSpeedOut"), false);
  assert.equal(flowGraph.nodes.some((node) => String(node.data.label) === "DiagAdminSrv"), false);
  assert.equal(flowGraph.nodes.some((node) => String(node.data.label) === "PowerModeOut"), false);
  assert.equal(flowGraph.nodes.some((node) => String(node.data.label) === "WakeupStatusOut"), false);
  assert.equal(nodeByLabel.get("StandardsCoverageComposition")!.position.x < nodeByLabel.get("CalibrationInst")!.position.x, true);
  assert.equal(nodeByLabel.get("StandardsCoverageComposition")!.position.y < nodeByLabel.get("CalibrationInst")!.position.y, true);
});

test("buildGraph covers mixed standards composition SWC families when internals are requested", async () => {
  const fixtureXml = fs.readFileSync(path.join(process.cwd(), "examples", "example-ecu-project.arxml"), "utf8");
  const model = buildAutosarModel("C:/workspace/example-ecu-project.arxml", parser.parse(fixtureXml));
  const fixtureSnapshot: WorkspaceSnapshot = {
    rootPath: "C:/workspace",
    files: [],
    explorerEntries: [],
    watched: true,
    lastIndexedAt: new Date().toISOString(),
    entities: model.entities,
    connections: model.connections
  };

  const graphService = createGraphService(fixtureSnapshot);
  const compositionGraph = await graphService.buildGraph({
    scope: "composition",
    focusId: "/ExampleEcuProject/StandardsCoverage/Components/StandardsCoverageComposition",
    depth: 1,
    includeCompositionInternals: true
  });
  const families = new Set(
    compositionGraph.nodes
      .filter((node) => node.kind === "instance")
      .map((node) => node.swcKind)
  );

  assert.equal(families.has("application"), true);
  assert.equal(families.has("parameter"), true);
  assert.equal(families.has("service"), true);
  assert.equal(families.has("sensor-actuator"), true);
  assert.equal(families.has("nv-block"), true);
  assert.equal(compositionGraph.edges.some((edge) => edge.kind === "assembly"), true);
  assert.equal(compositionGraph.edges.some((edge) => edge.kind === "delegation"), true);
});
