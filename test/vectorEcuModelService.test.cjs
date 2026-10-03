const assert = require("node:assert/strict");
const test = require("node:test");
const { buildVectorEcuModel, getCompositionOccurrenceName, getRootServiceInstances } = require("../src/model/vectorEcuModelService.ts");

test("reads flat instance and boundary-port mappings without making the extract canonical", () => {
  const flatMapFilePath = "C:/Project/Config/System/FlatMap.arxml";
  const flatExtractFilePath = "C:/Project/Config/System/FlatExtract.arxml";
  const documents = [
    {
      filePath: "C:/Project/Config/Developer/ECUProjects/ECU.arxml",
      relativePath: "Config/Developer/ECUProjects/ECU.arxml",
      content: `<AUTOSAR><SYSTEM><ROOT-SOFTWARE-COMPOSITIONS>
        <ROOT-SW-COMPOSITION-PROTOTYPE>
          <SHORT-NAME>RootOccurrence</SHORT-NAME>
          <SOFTWARE-COMPOSITION-TREF DEST="COMPOSITION-SW-COMPONENT-TYPE">/Types/Root</SOFTWARE-COMPOSITION-TREF>
        </ROOT-SW-COMPOSITION-PROTOTYPE>
      </ROOT-SOFTWARE-COMPOSITIONS></SYSTEM></AUTOSAR>`,
      entities: [
        { id: "unrelated", type: "composition", semanticPath: "/Types/Unrelated" },
        { id: "root", type: "composition", semanticPath: "/Types/Root" }
      ]
    },
    {
      filePath: flatExtractFilePath,
      relativePath: "Config/System/FlatExtract.arxml",
      entities: [{ id: "flat-root", type: "composition" }, { id: "flat-instance", type: "instance" }],
      connections: [{ id: "flat-edge" }]
    },
    {
      filePath: flatMapFilePath,
      relativePath: "Config/System/FlatMap.arxml",
      content: `<AUTOSAR><FLAT-INSTANCE-DESCRIPTORS>
        <FLAT-INSTANCE-DESCRIPTOR>
          <ECU-EXTRACT-REFERENCE-IREF><TARGET-REF DEST="SW-COMPONENT-PROTOTYPE">/Flat/App</TARGET-REF></ECU-EXTRACT-REFERENCE-IREF>
          <UPSTREAM-REFERENCE-IREF>
            <CONTEXT-ELEMENT-REF DEST="SW-COMPONENT-PROTOTYPE">/Root/Nested</CONTEXT-ELEMENT-REF>
            <TARGET-REF DEST="SW-COMPONENT-PROTOTYPE">/Types/Nested/App</TARGET-REF>
          </UPSTREAM-REFERENCE-IREF>
        </FLAT-INSTANCE-DESCRIPTOR>
        <FLAT-INSTANCE-DESCRIPTOR>
          <ECU-EXTRACT-REFERENCE-IREF><TARGET-REF DEST="P-PORT-PROTOTYPE">/Flat/NetworkOut</TARGET-REF></ECU-EXTRACT-REFERENCE-IREF>
          <UPSTREAM-REFERENCE-IREF><TARGET-REF DEST="P-PORT-PROTOTYPE">/Root/NetworkOut</TARGET-REF></UPSTREAM-REFERENCE-IREF>
        </FLAT-INSTANCE-DESCRIPTOR>
      </FLAT-INSTANCE-DESCRIPTORS></AUTOSAR>`
    }
  ];
  const project = { vectorEcuInputs: { flatMapFilePath, flatExtractFilePath } };

  const model = buildVectorEcuModel(documents, project);

  assert.equal(model.rootCompositionId, "root");
  assert.equal(model.rootPrototypeName, "RootOccurrence");
  assert.equal(model.flatCompositionId, "flat-root");
  assert.deepEqual(model.instanceMappings, [{
    flatInstancePath: "/Flat/App",
    upstreamInstancePath: "/Types/Nested/App",
    upstreamContextPaths: ["/Root/Nested"]
  }]);
  assert.deepEqual(model.portMappings, [{
    flatPortPath: "/Flat/NetworkOut",
    upstreamPortPath: "/Root/NetworkOut"
  }]);
  assert.deepEqual(model.flatConnections, [{ id: "flat-edge" }]);
});

test("links only flat-only service prototypes beneath the root composition", () => {
  const workspace = {
    entities: [
      { type: "swc", semanticPath: "/Types/Service", swcKind: "service" },
      { type: "swc", semanticPath: "/Types/App", swcKind: "application" }
    ],
    vectorEcu: {
      instanceMappings: [{ flatInstancePath: "/Flat/MappedService" }],
      flatEntities: [
        { id: "service", type: "instance", semanticPath: "/Flat/Service", typeRef: "/Types/Service" },
        { id: "mapped", type: "instance", semanticPath: "/Flat/MappedService", typeRef: "/Types/Service" },
        { id: "app", type: "instance", semanticPath: "/Flat/App", typeRef: "/Types/App" }
      ]
    }
  };

  assert.deepEqual(getRootServiceInstances(workspace).map((instance) => instance.id), ["service"]);
});

test("labels an instance boundary with its prototype name, not its composition type", () => {
  const workspace = {
    entities: [{
      type: "instance",
      semanticPath: "/Root/StellarCompositionOne",
      shortName: "StellarCompositionOne"
    }],
    vectorEcu: { rootPrototypeName: "EcuSwComposition" }
  };

  assert.equal(getCompositionOccurrenceName(workspace, "StellarCompositionType", undefined), "StellarCompositionType");
  assert.equal(getCompositionOccurrenceName(workspace, "ECU_Composition", []), "EcuSwComposition");
  assert.equal(
    getCompositionOccurrenceName(workspace, "StellarCompositionType", ["/Root/StellarCompositionOne"]),
    "StellarCompositionOne"
  );
});
