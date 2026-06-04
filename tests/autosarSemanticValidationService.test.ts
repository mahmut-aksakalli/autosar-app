import test from "node:test";
import assert from "node:assert/strict";
import type { ArxmlDocumentData, AutosarEntity, PortConnection, ValidationScope } from "../src/shared/contracts.js";
import { AutosarSemanticValidationService } from "../electron/services/autosarSemanticValidationService.js";

const service = new AutosarSemanticValidationService();

function createDocument(input: {
  filePath: string;
  scope: ValidationScope;
  entities: AutosarEntity[];
  connections?: PortConnection[];
}): ArxmlDocumentData {
  return {
    filePath: input.filePath,
    relativePath: input.filePath.split(/[\\/]/).at(-1) ?? input.filePath,
    content: "<AUTOSAR />",
    rootTag: "AUTOSAR",
    shortName: "Test",
    entities: input.entities,
    connections: input.connections ?? [],
    structuredFields: [],
    validationIssues: [],
    validation: {
      scope: input.scope,
      completeness: "not-validated",
      validatedAt: "2026-05-22T00:00:00.000Z"
    },
    entityCount: input.entities.length
  };
}

test("semantic validation treats missing single-file references as external", () => {
  const [document] = service.validateDocuments(
    [
      createDocument({
        filePath: "C:/workspace/standalone.arxml",
        scope: "single-file",
        entities: [
          {
            id: "port",
            type: "port",
            shortName: "SpeedIn",
            path: "/Pkg/Swc/SpeedIn",
            filePath: "C:/workspace/standalone.arxml",
            semanticPath: "/Pkg/Swc/SpeedIn",
            xmlPath: "/AUTOSAR/.../SpeedIn",
            typeRef: "/Pkg/Interfaces/Speed_I"
          }
        ]
      })
    ],
    "single-file"
  );

  const issue = document?.validationIssues[0];
  assert.equal(issue?.referenceStatus, "external");
  assert.equal(issue?.severity, "warning");
  assert.equal(issue?.code, "ARXML_SEMANTIC_PORT_INTERFACE_REF");
});

test("semantic validation escalates missing workspace references to unresolved errors", () => {
  const [document] = service.validateDocuments(
    [
      createDocument({
        filePath: "C:/workspace/project.arxml",
        scope: "workspace",
        entities: [
          {
            id: "instance",
            type: "instance",
            shortName: "AppInst",
            path: "/Pkg/Root/AppInst",
            filePath: "C:/workspace/project.arxml",
            semanticPath: "/Pkg/Root/AppInst",
            xmlPath: "/AUTOSAR/.../AppInst",
            typeRef: "/Pkg/MissingApp"
          }
        ]
      })
    ],
    "workspace"
  );

  const issue = document?.validationIssues[0];
  assert.equal(issue?.referenceStatus, "unresolved");
  assert.equal(issue?.severity, "error");
  assert.equal(issue?.expectedDestination, "swc|composition");
});

test("semantic validation reports wrong destination kinds", () => {
  const [document] = service.validateDocuments(
    [
      createDocument({
        filePath: "C:/workspace/wrong-kind.arxml",
        scope: "workspace",
        entities: [
          {
            id: "app",
            type: "swc",
            shortName: "App",
            path: "/Pkg/App",
            filePath: "C:/workspace/wrong-kind.arxml",
            semanticPath: "/Pkg/App"
          },
          {
            id: "port",
            type: "port",
            shortName: "BadPort",
            path: "/Pkg/App/BadPort",
            filePath: "C:/workspace/wrong-kind.arxml",
            semanticPath: "/Pkg/App/BadPort",
            xmlPath: "/AUTOSAR/.../BadPort",
            typeRef: "/Pkg/App"
          }
        ]
      })
    ],
    "workspace"
  );

  const issue = document?.validationIssues[0];
  assert.equal(issue?.referenceStatus, "wrong-kind");
  assert.equal(issue?.severity, "error");
  assert.match(issue?.message ?? "", /resolved to swc instead of interface/);
});

test("semantic validation detects duplicate semantic paths", () => {
  const [document] = service.validateDocuments(
    [
      createDocument({
        filePath: "C:/workspace/duplicates.arxml",
        scope: "workspace",
        entities: [
          {
            id: "app-a",
            type: "swc",
            shortName: "AppA",
            path: "/Pkg/App",
            filePath: "C:/workspace/duplicates.arxml",
            semanticPath: "/Pkg/App"
          },
          {
            id: "app-b",
            type: "swc",
            shortName: "AppB",
            path: "/Pkg/App",
            filePath: "C:/workspace/duplicates.arxml",
            semanticPath: "/Pkg/App"
          }
        ]
      })
    ],
    "workspace"
  );

  assert.equal(
    document?.validationIssues.filter((issue) => issue.code === "ARXML_SEMANTIC_DUPLICATE_PATH").length,
    2
  );
});

test("semantic validation resolves connector endpoints by expected kind", () => {
  const [document] = service.validateDocuments(
    [
      createDocument({
        filePath: "C:/workspace/connectors.arxml",
        scope: "workspace",
        entities: [
          {
            id: "root",
            type: "composition",
            shortName: "Root",
            path: "/Pkg/Root",
            filePath: "C:/workspace/connectors.arxml",
            semanticPath: "/Pkg/Root"
          },
          {
            id: "inst",
            type: "instance",
            shortName: "AppInst",
            path: "/Pkg/Root/AppInst",
            filePath: "C:/workspace/connectors.arxml",
            semanticPath: "/Pkg/Root/AppInst"
          },
          {
            id: "port",
            type: "port",
            shortName: "Out",
            path: "/Pkg/App/Out",
            filePath: "C:/workspace/connectors.arxml",
            semanticPath: "/Pkg/App/Out"
          }
        ],
        connections: [
          {
            id: "connector",
            from: "/Pkg/App/Out",
            to: "/Pkg/Root/MissingOuter",
            label: "BrokenDelegation",
            filePath: "C:/workspace/connectors.arxml",
            kind: "delegation",
            providerComponentRef: "/Pkg/Root/AppInst",
            sourcePortRef: "/Pkg/App/Out",
            outerPortRef: "/Pkg/Root/MissingOuter"
          }
        ]
      })
    ],
    "workspace"
  );

  assert.equal(document?.validationIssues.length, 1);
  assert.equal(document?.validationIssues[0]?.referenceValue, "/Pkg/Root/MissingOuter");
  assert.equal(document?.validationIssues[0]?.referenceStatus, "unresolved");
});
