import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { buildAutosarModel } from "../electron/services/autosarModel.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});
const standardsCoverageFixture = fs.readFileSync(
  path.join(process.cwd(), "examples", "example-ecu-project.arxml"),
  "utf8"
);

const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>EngineControl</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>StatusOut</SHORT-NAME>
            </P-PORT-PROTOTYPE>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>CommandIn</SHORT-NAME>
            </R-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

test("buildAutosarModel extracts SWCs and ports", () => {
  const parsed = parser.parse(sampleXml);
  const model = buildAutosarModel("C:/workspace/sample.arxml", parsed);

  assert.equal(model.rootTag, "AUTOSAR");
  assert.equal(model.shortName, "Pkg");
  assert.equal(model.entities.some((entity) => entity.shortName === "EngineControl"), true);
  assert.equal(model.entities.filter((entity) => entity.type === "port").length, 2);
  assert.equal(
    model.entities.find((entity) => entity.shortName === "EngineControl")?.semanticPath,
    "/Pkg/EngineControl"
  );
  assert.equal(
    model.entities.find((entity) => entity.shortName === "StatusOut")?.parentSemanticPath,
    "/Pkg/EngineControl"
  );
  assert.deepEqual(
    model.structuredFields.find(
      (field) =>
        field.key === "SHORT-NAME" &&
        field.value === "EngineControl" &&
        field.xmlPath?.includes("APPLICATION-SW-COMPONENT-TYPE")
    ),
    {
      key: "SHORT-NAME",
      value: "EngineControl",
      category: "swc",
      xmlPath:
        "/AUTOSAR/AR-PACKAGES/AR-PACKAGE/ELEMENTS/APPLICATION-SW-COMPONENT-TYPE/SHORT-NAME",
      editable: true
    }
  );
});

test("buildAutosarModel annotates entities with version-aware semantic extraction metadata", () => {
  const parsed = parser.parse(sampleXml);
  const model = buildAutosarModel("C:/workspace/sample.arxml", parsed, {
    validation: {
      scope: "workspace",
      completeness: "complete",
      autosarRelease: "R4.4.0",
      autosarVersion: "4.4.0",
      schemaFile: "R4.4.0/AUTOSAR_00046.xsd",
      namespace: "http://autosar.org/schema/r4.0",
      validatedAt: "2026-05-22T00:00:00.000Z"
    },
    validationScope: "workspace"
  });

  const swc = model.entities.find((entity) => entity.shortName === "EngineControl");
  const port = model.entities.find((entity) => entity.shortName === "StatusOut");

  assert.equal(swc?.rawTagName, "APPLICATION-SW-COMPONENT-TYPE");
  assert.equal(swc?.semanticKind, "swc");
  assert.equal(swc?.autosarVersion, "4.4.0");
  assert.equal(swc?.autosarRelease, "R4.4.0");
  assert.equal(swc?.extractionProfile, "classic");
  assert.equal(swc?.extractionAdapterId, "classic-4.4.0");
  assert.equal(swc?.modelCompleteness, "complete");
  assert.equal(swc?.validationScope, "workspace");
  assert.deepEqual(swc?.shortNamePath, ["Pkg", "EngineControl"]);
  assert.equal(swc?.packagePath, "/Pkg");
  assert.equal(port?.semanticKind, "port");
  assert.deepEqual(port?.shortNamePath, ["Pkg", "EngineControl", "StatusOut"]);
});

test("buildAutosarModel extracts composition instances and delegation connectors", () => {
  const compositionXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>SenderSwc</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>DataOut</SHORT-NAME>
            </P-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
        <COMPOSITION-SW-COMPONENT-TYPE>
          <SHORT-NAME>RootComposition</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>ExportedData</SHORT-NAME>
            </P-PORT-PROTOTYPE>
          </PORTS>
          <COMPONENTS>
            <SW-COMPONENT-PROTOTYPE>
              <SHORT-NAME>SenderInst</SHORT-NAME>
              <TYPE-TREF DEST="APPLICATION-SW-COMPONENT-TYPE">/Pkg/SenderSwc</TYPE-TREF>
            </SW-COMPONENT-PROTOTYPE>
          </COMPONENTS>
          <CONNECTORS>
            <DELEGATION-SW-CONNECTOR>
              <SHORT-NAME>ExportSignal</SHORT-NAME>
              <INNER-PORT-IREF>
                <P-PORT-IN-COMPOSITION-INSTANCE-REF>
                  <CONTEXT-COMPONENT-REF DEST="SW-COMPONENT-PROTOTYPE">/Pkg/RootComposition/SenderInst</CONTEXT-COMPONENT-REF>
                  <TARGET-P-PORT-REF DEST="P-PORT-PROTOTYPE">/Pkg/SenderSwc/DataOut</TARGET-P-PORT-REF>
                </P-PORT-IN-COMPOSITION-INSTANCE-REF>
              </INNER-PORT-IREF>
              <OUTER-PORT-REF DEST="P-PORT-PROTOTYPE">/Pkg/RootComposition/ExportedData</OUTER-PORT-REF>
            </DELEGATION-SW-CONNECTOR>
          </CONNECTORS>
        </COMPOSITION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  const model = buildAutosarModel("C:/workspace/composition.arxml", parser.parse(compositionXml));
  const instance = model.entities.find((entity) => entity.type === "instance");
  const connection = model.connections[0];

  assert.equal(instance?.shortName, "SenderInst");
  assert.equal(instance?.semanticPath, "/Pkg/RootComposition/SenderInst");
  assert.equal(instance?.parentSemanticPath, "/Pkg/RootComposition");
  assert.equal(instance?.typeRef, "/Pkg/SenderSwc");
  assert.equal(connection?.kind, "delegation");
  assert.equal(connection?.providerComponentRef, "/Pkg/RootComposition/SenderInst");
  assert.equal(connection?.sourcePortRef, "/Pkg/SenderSwc/DataOut");
  assert.equal(connection?.outerPortRef, "/Pkg/RootComposition/ExportedData");
});

test("buildAutosarModel extracts SWC inspector internals", () => {
  const model = buildAutosarModel("C:/workspace/example.arxml", parser.parse(sampleXmlWithBehavior));
  const swc = model.entities.find((entity) => entity.shortName === "EngineControl");
  const statusOut = model.entities.find((entity) => entity.shortName === "StatusOut");

  assert.equal(swc?.inspector?.sections.find((section) => section.id === "runnables")?.items.length, 1);
  assert.equal(statusOut?.metadata?.DESCRIPTION, "Engine status output");
  assert.equal(statusOut?.metadata?.["ENABLE-INDIRECT-API"], "true");
  assert.equal(statusOut?.metadata?.["ENABLE-API-USAGE-BY-ADDRESS"], "true");
  assert.equal(statusOut?.metadata?.["COMMUNICATION-SPEC-DETAILS"]?.includes("EngineStatus"), true);
  assert.equal(statusOut?.metadata?.["PORT-DEFINED-ARGUMENT-VALUES"]?.includes("StatusArg"), true);
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "runnables")?.items[0]?.metadata?.PERIOD,
    "0.01"
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "runnables")?.items[0]?.metadata?.["SW-ADDR-METHOD-REF"],
    "/Pkg/MemMap/FastCode"
  );
  assert.equal(
    swc?.inspector?.sections
      .find((section) => section.id === "runnables")
      ?.items[0]?.metadata?.["ACTIVATION-REASON-DETAILS"]?.includes('"bit":"1"'),
    true
  );
  assert.equal(
    swc?.inspector?.sections
      .find((section) => section.id === "runnables")
      ?.items[0]?.metadata?.["ACTIVATION-REASON-DETAILS"]?.includes('"symbol":"MainStepActivationSymbol"'),
    true
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "perInstanceMemory")?.items[0]?.label,
    "PimCounter"
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "calibrationVariables")?.items[0]?.label,
    "CalGain"
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "calibrationVariables")?.items[0]?.metadata?.["INITIAL-VALUE"],
    "42"
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interRunnableVariables")?.items[0]?.label,
    "SharedState"
  );
});

test("buildAutosarModel classifies AUTOSAR SWC families, ports, and interfaces from the standards fixture", () => {
  const model = buildAutosarModel("C:/workspace/example-ecu-project.arxml", parser.parse(standardsCoverageFixture));

  assert.equal(model.entities.find((entity) => entity.shortName === "SharedCalibrationSwc")?.swcKind, "parameter");
  assert.equal(model.entities.find((entity) => entity.shortName === "DiagnosticServiceSwc")?.swcKind, "service");
  assert.equal(model.entities.find((entity) => entity.shortName === "DiagnosticProxySwc")?.swcKind, "service-proxy");
  assert.equal(model.entities.find((entity) => entity.shortName === "WakeupNvBlockSwc")?.swcKind, "nv-block");
  assert.equal(model.entities.find((entity) => entity.shortName === "WheelSpeedSensorSwc")?.swcKind, "sensor-actuator");
  assert.equal(model.entities.find((entity) => entity.shortName === "IoAbstractionSwc")?.swcKind, "ecu-abstraction");
  assert.equal(
    model.entities.find((entity) => entity.shortName === "WakeupComplexDriverSwc")?.swcKind,
    "complex-device-driver"
  );
  assert.equal(model.entities.find((entity) => entity.shortName === "CoverageApplicationSwc")?.swcKind, "application");
  assert.equal(
    model.entities.find((entity) => entity.shortName === "StandardsCoverageComposition")?.swcKind,
    "composition"
  );

  assert.equal(model.entities.find((entity) => entity.shortName === "CalibrationOut")?.portKind, "provided");
  assert.equal(model.entities.find((entity) => entity.shortName === "DiagAdminClient")?.portKind, "required");
  assert.equal(model.entities.find((entity) => entity.shortName === "WakeupDataPr")?.portKind, "provided-required");
  assert.equal(
    model.entities.find((entity) => entity.shortName === "WakeupDataPr")?.portDirection,
    "provided-required"
  );

  assert.equal(model.entities.find((entity) => entity.shortName === "PhysicalSpeed_I")?.interfaceKind, "sender-receiver");
  assert.equal(model.entities.find((entity) => entity.shortName === "DiagAdmin_I")?.interfaceKind, "client-server");
  assert.equal(model.entities.find((entity) => entity.shortName === "SharedCalibration_I")?.interfaceKind, "parameter");
  assert.equal(model.entities.find((entity) => entity.shortName === "SharedNvData_I")?.interfaceKind, "nv-data");
  assert.equal(model.entities.find((entity) => entity.shortName === "PowerMode_I")?.interfaceKind, "mode-switch");
  assert.equal(model.entities.find((entity) => entity.shortName === "WakeupTrigger_I")?.interfaceKind, "trigger");
});

test("buildAutosarModel attaches interface member sections to SWC inspectors", () => {
  const model = buildAutosarModel("C:/workspace/example-ecu-project.arxml", parser.parse(standardsCoverageFixture));
  const swc = model.entities.find((entity) => entity.shortName === "CoverageApplicationSwc");

  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interfaceParameters")?.items.some((item) => item.label === "SpeedGain"),
    true
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interfaceOperations")?.items.some((item) => item.label === "RequestSession"),
    true
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interfaceApplicationErrors")?.items.some((item) => item.label === "DiagDenied_E"),
    true
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interfaceModeGroups")?.items.some((item) => item.label === "PowerMode"),
    true
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interfaceTriggers")?.items.some((item) => item.label === "FastWakeup"),
    true
  );
  assert.equal(
    swc?.inspector?.sections.find((section) => section.id === "interfaceDataElements")?.items.some((item) => item.label === "StoredWakeupCounter"),
    true
  );
});

test("buildAutosarModel enriches runnable details with access points and trigger events", () => {
  const model = buildAutosarModel("C:/workspace/example-ecu-project.arxml", parser.parse(standardsCoverageFixture));
  const swc = model.entities.find((entity) => entity.shortName === "CoverageApplicationSwc");
  const runnable = swc?.inspector?.sections
    .find((section) => section.id === "runnables")
    ?.items.find((item) => item.label === "EvaluateCoveragePaths");

  assert.equal(runnable?.metadata?.SYMBOL, "Coverage_EvaluateCoveragePaths");
  assert.equal(runnable?.metadata?.CONCURRENT, "true");
  assert.equal(runnable?.metadata?.["MIN-START-INTERVAL"], "0.02");
  assert.equal(runnable?.metadata?.["ACCESS-POINTS"]?.includes("ReadSpeedImplicit"), true);
  assert.equal(runnable?.metadata?.["ACCESS-POINTS"]?.includes("EvaluateToPublishTrigger"), true);
  assert.equal(runnable?.metadata?.["ACCESS-POINT-DETAILS"]?.includes('"access":"Read (implicit)"'), true);
  assert.equal(runnable?.metadata?.["ACCESS-POINT-DETAILS"]?.includes('"name":"ReadSpeedImplicit"'), true);
  assert.equal(runnable?.metadata?.["TRIGGER-EVENTS"]?.includes("EvaluateCoveragePathsEvent"), true);
  assert.equal(runnable?.metadata?.["TRIGGER-EVENTS"]?.includes("SpeedInEvent"), true);
  assert.equal(runnable?.metadata?.["TRIGGER-EVENT-DETAILS"]?.includes('"type":"Timing Event"'), true);
  assert.equal(runnable?.metadata?.["TRIGGER-EVENT-DETAILS"]?.includes('"name":"EvaluateCoveragePathsEvent"'), true);
});

test("buildAutosarModel preserves mayBeUnconnected and raises interface validation warnings", () => {
  const warningXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>WarningPkg</SHORT-NAME>
      <ELEMENTS>
        <PARAMETER-INTERFACE>
          <SHORT-NAME>Config_I</SHORT-NAME>
          <PARAMETERS>
            <PARAMETER-DATA-PROTOTYPE>
              <SHORT-NAME>Threshold</SHORT-NAME>
            </PARAMETER-DATA-PROTOTYPE>
          </PARAMETERS>
        </PARAMETER-INTERFACE>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>WarningApp</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>ConfigOut</SHORT-NAME>
              <MAY-BE-UNCONNECTED>true</MAY-BE-UNCONNECTED>
              <PROVIDED-INTERFACE-TREF DEST="PARAMETER-INTERFACE">/WarningPkg/Config_I</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
            <PR-PORT-PROTOTYPE>
              <SHORT-NAME>BrokenMirror</SHORT-NAME>
            </PR-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  const model = buildAutosarModel("C:/workspace/warnings.arxml", parser.parse(warningXml));
  const configOut = model.entities.find((entity) => entity.shortName === "ConfigOut");

  assert.equal(configOut?.mayBeUnconnected, true);
  assert.equal(
    model.validationIssues.some((issue) => issue.message.includes("unsupported component kind application")),
    true
  );
  assert.equal(
    model.validationIssues.some((issue) => issue.message.includes("BrokenMirror does not reference a PortInterface")),
    true
  );
  assert.equal(
    model.validationIssues.some((issue) => issue.message.includes("BrokenMirror is a PR port without PROVIDED-REQUIRED-INTERFACE-TREF")),
    true
  );
});

const sampleXmlWithBehavior = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>EngineControl</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>StatusOut</SHORT-NAME>
              <DESC>
                <L-2 L="EN">Engine status output</L-2>
              </DESC>
              <PROVIDED-COM-SPECS>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Status_I/EngineStatus</DATA-ELEMENT-REF>
                  <INIT-VALUE>
                    <NUMERICAL-VALUE-SPECIFICATION>
                      <VALUE>1</VALUE>
                    </NUMERICAL-VALUE-SPECIFICATION>
                  </INIT-VALUE>
                </NONQUEUED-SENDER-COM-SPEC>
              </PROVIDED-COM-SPECS>
              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/Interfaces/Status_I</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
          </PORTS>
          <INTERNAL-BEHAVIORS>
            <SWC-INTERNAL-BEHAVIOR>
              <SHORT-NAME>EngineBehavior</SHORT-NAME>
              <PORT-API-OPTIONS>
                <PORT-API-OPTION>
                  <PORT-REF DEST="P-PORT-PROTOTYPE">/Pkg/EngineControl/StatusOut</PORT-REF>
                  <INDIRECT-API>true</INDIRECT-API>
                  <ENABLE-TAKE-ADDRESS>true</ENABLE-TAKE-ADDRESS>
                  <PORT-ARG-VALUES>
                    <PORT-DEFINED-ARGUMENT-VALUE>
                      <VALUE>
                        <TEXT-VALUE-SPECIFICATION>
                          <SHORT-LABEL>StatusArg</SHORT-LABEL>
                          <VALUE>Enabled</VALUE>
                        </TEXT-VALUE-SPECIFICATION>
                      </VALUE>
                      <VALUE-TYPE-TREF DEST="IMPLEMENTATION-DATA-TYPE">/Pkg/DataTypes/uint8</VALUE-TYPE-TREF>
                    </PORT-DEFINED-ARGUMENT-VALUE>
                  </PORT-ARG-VALUES>
                </PORT-API-OPTION>
              </PORT-API-OPTIONS>
              <PER-INSTANCE-MEMORYS>
                <PER-INSTANCE-MEMORY>
                  <SHORT-NAME>PimCounter</SHORT-NAME>
                  <TYPE>uint16</TYPE>
                </PER-INSTANCE-MEMORY>
              </PER-INSTANCE-MEMORYS>
              <RUNNABLES>
                <RUNNABLE-ENTITY>
                  <SHORT-NAME>MainStep</SHORT-NAME>
                  <SYMBOL>MainStep_Impl</SYMBOL>
                  <SW-ADDR-METHOD-REF DEST="SW-ADDR-METHOD">/Pkg/MemMap/FastCode</SW-ADDR-METHOD-REF>
                  <ACTIVATION-REASONS>
                    <EXECUTABLE-ENTITY-ACTIVATION-REASON>
                      <SHORT-NAME>MainStepActivation</SHORT-NAME>
                      <SYMBOL>MainStepActivationSymbol</SYMBOL>
                      <BIT-POSITION>1</BIT-POSITION>
                    </EXECUTABLE-ENTITY-ACTIVATION-REASON>
                  </ACTIVATION-REASONS>
                  <CAN-BE-INVOKED-CONCURRENTLY>false</CAN-BE-INVOKED-CONCURRENTLY>
                </RUNNABLE-ENTITY>
              </RUNNABLES>
              <EVENTS>
                <TIMING-EVENT>
                  <SHORT-NAME>MainStepTrigger</SHORT-NAME>
                  <START-ON-EVENT-REF DEST="RUNNABLE-ENTITY">/Pkg/EngineControl/EngineBehavior/MainStep</START-ON-EVENT-REF>
                  <PERIOD>0.01</PERIOD>
                </TIMING-EVENT>
              </EVENTS>
              <PARAMETERS>
                <PARAMETER-DATA-PROTOTYPE>
                  <SHORT-NAME>CalGain</SHORT-NAME>
                  <INIT-VALUE>
                    <NUMERICAL-VALUE-SPECIFICATION>
                      <VALUE>42</VALUE>
                    </NUMERICAL-VALUE-SPECIFICATION>
                  </INIT-VALUE>
                </PARAMETER-DATA-PROTOTYPE>
              </PARAMETERS>
              <AR-TYPED-PER-INSTANCE-MEMORYS>
                <VARIABLE-DATA-PROTOTYPE>
                  <SHORT-NAME>SharedState</SHORT-NAME>
                </VARIABLE-DATA-PROTOTYPE>
              </AR-TYPED-PER-INSTANCE-MEMORYS>
            </SWC-INTERNAL-BEHAVIOR>
          </INTERNAL-BEHAVIORS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
