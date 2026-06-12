import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
  buildAutosarModel,
  enrichPortCommunicationSpecsFromEntities,
  enrichPortInterfaceMetadataFromEntities
} from "../electron/services/autosarModel.js";

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
  const statusIn = model.entities.find((entity) => entity.shortName === "StatusIn");

  assert.equal(swc?.inspector?.sections.find((section) => section.id === "runnables")?.items.length, 1);
  assert.equal(statusOut?.metadata?.DESCRIPTION, "Engine status output");
  assert.equal(statusOut?.metadata?.["IS-SERVICE"], "true");
  assert.equal(statusOut?.metadata?.["ENABLE-INDIRECT-API"], "true");
  assert.equal(statusOut?.metadata?.["ENABLE-API-USAGE-BY-ADDRESS"], "true");
  assert.equal(statusOut?.metadata?.["TRANSFORMATION-ERROR-HANDLING"], "TRANSFORMER-ERROR-HANDLING");
  assert.equal(statusOut?.metadata?.["COMMUNICATION-SPEC-DETAILS"]?.includes("EngineStatus"), true);
  const communicationSpecDetails = JSON.parse(statusOut?.metadata?.["COMMUNICATION-SPEC-DETAILS"] ?? "[]") as Array<
    Record<string, string>
  >;
  assert.equal(communicationSpecDetails[0]?.dataType, "/Pkg/DataTypes/uint8");
  assert.equal(communicationSpecDetails[0]?.dataConstraints, "/Pkg/DataConstraints/StatusConstraint");
  assert.equal(communicationSpecDetails[0]?.addressingMethod, "/Pkg/MemMap/FastData");
  assert.equal(communicationSpecDetails[0]?.useQueuedCommunication, "false");
  assert.equal(communicationSpecDetails[0]?.measurementCalibration, "READ-WRITE");
  assert.equal(communicationSpecDetails[0]?.handleInvalid, "KEEP");
  assert.equal(communicationSpecDetails[0]?.comSpecDirection, "sender");
  assert.equal(communicationSpecDetails[0]?.usesTxAcknowledge, "true");
  assert.equal(communicationSpecDetails[0]?.transmissionAcknowledgeTimeout, "0.01");
  const receiverCommunicationSpecDetails = JSON.parse(
    statusIn?.metadata?.["COMMUNICATION-SPEC-DETAILS"] ?? "[]"
  ) as Array<Record<string, string>>;
  assert.equal(receiverCommunicationSpecDetails[0]?.comSpecDirection, "receiver");
  assert.equal(receiverCommunicationSpecDetails[0]?.useQueuedCommunication, "false");
  assert.equal(receiverCommunicationSpecDetails[0]?.aliveTimeout, "0.02");
  assert.equal(receiverCommunicationSpecDetails[0]?.enableUpdate, "true");
  assert.equal(receiverCommunicationSpecDetails[0]?.handleNeverReceived, "REPLACE");
  assert.equal(receiverCommunicationSpecDetails[0]?.usesEndToEndProtection, "true");
  assert.equal(receiverCommunicationSpecDetails[0]?.usesEndToEndProtectionErrorHandling, "true");
  assert.equal(receiverCommunicationSpecDetails[0]?.timeoutSubstitutionValueType, "Numerical Value Specification");
  assert.equal(receiverCommunicationSpecDetails[0]?.timeoutSubstitutionValue, "0");
  assert.equal(receiverCommunicationSpecDetails[0]?.handleTimeoutType, "REPLACE");
  assert.equal(receiverCommunicationSpecDetails[0]?.handleDataStatus, "true");
  assert.equal(receiverCommunicationSpecDetails[0]?.queueLength, "4");
  assert.equal(receiverCommunicationSpecDetails[0]?.rxFilter.includes("ALWAYS"), true);
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

test("buildAutosarModel formats complex ComSpec init value specifications", () => {
  const parsed = parser.parse(`<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>InitValueSwc</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>ConstantOut</SHORT-NAME>
              <PROVIDED-COM-SPECS>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Init_I/ConstantValue</DATA-ELEMENT-REF>
                  <INIT-VALUE>
                    <CONSTANT-REFERENCE>
                      <CONSTANT-REF DEST="CONSTANT-SPECIFICATION">/Pkg/Constants/CConstantValue</CONSTANT-REF>
                    </CONSTANT-REFERENCE>
                  </INIT-VALUE>
                </NONQUEUED-SENDER-COM-SPEC>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Init_I/ApplicationValue</DATA-ELEMENT-REF>
                  <INIT-VALUE>
                    <APPLICATION-VALUE-SPECIFICATION>
                      <CATEGORY>VALUE</CATEGORY>
                      <SW-VALUE-CONT>
                        <SW-VALUES>
                          <V>7</V>
                          <V>8</V>
                        </SW-VALUES>
                      </SW-VALUE-CONT>
                    </APPLICATION-VALUE-SPECIFICATION>
                  </INIT-VALUE>
                </NONQUEUED-SENDER-COM-SPEC>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Init_I/ArrayValue</DATA-ELEMENT-REF>
                  <INIT-VALUE>
                    <ARRAY-VALUE-SPECIFICATION>
                      <ELEMENTS>
                        <NUMERICAL-VALUE-SPECIFICATION>
                          <VALUE>1</VALUE>
                        </NUMERICAL-VALUE-SPECIFICATION>
                        <TEXT-VALUE-SPECIFICATION>
                          <VALUE>Ready</VALUE>
                        </TEXT-VALUE-SPECIFICATION>
                      </ELEMENTS>
                    </ARRAY-VALUE-SPECIFICATION>
                  </INIT-VALUE>
                </NONQUEUED-SENDER-COM-SPEC>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Init_I/RecordValue</DATA-ELEMENT-REF>
                  <INIT-VALUE>
                    <RECORD-VALUE-SPECIFICATION>
                      <FIELDS>
                        <NUMERICAL-VALUE-SPECIFICATION>
                          <SHORT-LABEL>Offset</SHORT-LABEL>
                          <VALUE>10</VALUE>
                        </NUMERICAL-VALUE-SPECIFICATION>
                        <TEXT-VALUE-SPECIFICATION>
                          <SHORT-LABEL>State</SHORT-LABEL>
                          <VALUE>On</VALUE>
                        </TEXT-VALUE-SPECIFICATION>
                      </FIELDS>
                    </RECORD-VALUE-SPECIFICATION>
                  </INIT-VALUE>
                </NONQUEUED-SENDER-COM-SPEC>
              </PROVIDED-COM-SPECS>
              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/Interfaces/Init_I</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>Constants</SHORT-NAME>
          <ELEMENTS>
            <CONSTANT-SPECIFICATION>
              <SHORT-NAME>CConstantValue</SHORT-NAME>
              <VALUE-SPEC>
                <TEXT-VALUE-SPECIFICATION>
                  <VALUE>ResolvedConstant</VALUE>
                </TEXT-VALUE-SPECIFICATION>
              </VALUE-SPEC>
            </CONSTANT-SPECIFICATION>
          </ELEMENTS>
        </AR-PACKAGE>
        <AR-PACKAGE>
          <SHORT-NAME>Interfaces</SHORT-NAME>
          <ELEMENTS>
            <SENDER-RECEIVER-INTERFACE>
              <SHORT-NAME>Init_I</SHORT-NAME>
              <DATA-ELEMENTS>
                <VARIABLE-DATA-PROTOTYPE><SHORT-NAME>ConstantValue</SHORT-NAME></VARIABLE-DATA-PROTOTYPE>
                <VARIABLE-DATA-PROTOTYPE><SHORT-NAME>ApplicationValue</SHORT-NAME></VARIABLE-DATA-PROTOTYPE>
                <VARIABLE-DATA-PROTOTYPE><SHORT-NAME>ArrayValue</SHORT-NAME></VARIABLE-DATA-PROTOTYPE>
                <VARIABLE-DATA-PROTOTYPE><SHORT-NAME>RecordValue</SHORT-NAME></VARIABLE-DATA-PROTOTYPE>
              </DATA-ELEMENTS>
            </SENDER-RECEIVER-INTERFACE>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`);
  const model = buildAutosarModel("C:/workspace/init-values.arxml", parsed);
  const port = model.entities.find((entity) => entity.shortName === "ConstantOut");
  const details = JSON.parse(port?.metadata?.["COMMUNICATION-SPEC-DETAILS"] ?? "[]") as Array<{
    dataElement: string;
    initValue: string;
  }>;
  const byElement = new Map(details.map((detail) => [detail.dataElement, detail.initValue]));

  assert.equal(byElement.get("/Pkg/Interfaces/Init_I/ConstantValue"), "ResolvedConstant");
  assert.equal(byElement.get("/Pkg/Interfaces/Init_I/ApplicationValue"), "7,8");
  assert.equal(byElement.get("/Pkg/Interfaces/Init_I/ArrayValue"), "[1,Ready]");
  assert.equal(byElement.get("/Pkg/Interfaces/Init_I/RecordValue"), "{Offset: 10, State: On}");
});

test("workspace enrichment resolves ComSpec constant init values across files", () => {
  const swcXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>ConstantConsumer</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>CalibrationOut</SHORT-NAME>
              <PROVIDED-COM-SPECS>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Calibration_I/CalibrationValue</DATA-ELEMENT-REF>
                  <INIT-VALUE>
                    <CONSTANT-REFERENCE>
                      <CONSTANT-REF DEST="CONSTANT-SPECIFICATION">/DataTypes/FrunkManagement/Constants/CFrunkCalibrationData</CONSTANT-REF>
                    </CONSTANT-REFERENCE>
                  </INIT-VALUE>
                </NONQUEUED-SENDER-COM-SPEC>
              </PROVIDED-COM-SPECS>
              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/Interfaces/Calibration_I</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
  const constantXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>DataTypes</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>FrunkManagement</SHORT-NAME>
          <AR-PACKAGES>
            <AR-PACKAGE>
              <SHORT-NAME>Constants</SHORT-NAME>
              <ELEMENTS>
                <CONSTANT-SPECIFICATION>
                  <SHORT-NAME>CFrunkCalibrationData</SHORT-NAME>
                  <VALUE-SPEC>
                    <ARRAY-VALUE-SPECIFICATION>
                      <ELEMENTS>
                        <NUMERICAL-VALUE-SPECIFICATION><VALUE>0</VALUE></NUMERICAL-VALUE-SPECIFICATION>
                        <NUMERICAL-VALUE-SPECIFICATION><VALUE>1</VALUE></NUMERICAL-VALUE-SPECIFICATION>
                        <NUMERICAL-VALUE-SPECIFICATION><VALUE>2</VALUE></NUMERICAL-VALUE-SPECIFICATION>
                      </ELEMENTS>
                    </ARRAY-VALUE-SPECIFICATION>
                  </VALUE-SPEC>
                </CONSTANT-SPECIFICATION>
              </ELEMENTS>
            </AR-PACKAGE>
          </AR-PACKAGES>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  const swcModel = buildAutosarModel("C:/workspace/swc.arxml", parser.parse(swcXml));
  const constantModel = buildAutosarModel("C:/workspace/constants.arxml", parser.parse(constantXml));
  const entities = [...swcModel.entities, ...constantModel.entities];
  enrichPortCommunicationSpecsFromEntities(entities);

  const port = entities.find((entity) => entity.shortName === "CalibrationOut");
  const details = JSON.parse(port?.metadata?.["COMMUNICATION-SPEC-DETAILS"] ?? "[]") as Array<Record<string, string>>;

  assert.equal(constantModel.entities.find((entity) => entity.shortName === "CFrunkCalibrationData")?.type, "constant");
  assert.equal(details[0]?.initValue, "[0,1,2]");
});

test("workspace enrichment resolves communication spec interface properties across files by direct refs", () => {
  const swcXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>ActiveAeroSwc</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>AeroOut</SHORT-NAME>
              <PROVIDED-COM-SPECS>
                <NONQUEUED-SENDER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/PortInterfaces/ActiveAero/PiIaActiveAero/DeAnimationReq</DATA-ELEMENT-REF>
                </NONQUEUED-SENDER-COM-SPEC>
              </PROVIDED-COM-SPECS>
              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/PortInterfaces/ActiveAero/PiIaActiveAero</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
  const interfaceXml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>PortInterfaces</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>ActiveAero</SHORT-NAME>
          <ELEMENTS>
            <SENDER-RECEIVER-INTERFACE>
              <SHORT-NAME>PiIaActiveAero</SHORT-NAME>
              <IS-SERVICE>true</IS-SERVICE>
              <DATA-ELEMENTS>
                <VARIABLE-DATA-PROTOTYPE>
                  <SHORT-NAME>DeAnimationReq</SHORT-NAME>
                  <TYPE-TREF DEST="IMPLEMENTATION-DATA-TYPE">/DataTypes/Boolean</TYPE-TREF>
                  <SW-DATA-DEF-PROPS>
                    <SW-DATA-DEF-PROPS-VARIANTS>
                      <SW-DATA-DEF-PROPS-CONDITIONAL>
                        <SW-CALIBRATION-ACCESS>READ-WRITE</SW-CALIBRATION-ACCESS>
                      </SW-DATA-DEF-PROPS-CONDITIONAL>
                    </SW-DATA-DEF-PROPS-VARIANTS>
                  </SW-DATA-DEF-PROPS>
                </VARIABLE-DATA-PROTOTYPE>
              </DATA-ELEMENTS>
            </SENDER-RECEIVER-INTERFACE>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  const swcModel = buildAutosarModel("C:/workspace/swc.arxml", parser.parse(swcXml));
  const interfaceModel = buildAutosarModel("C:/workspace/interface.arxml", parser.parse(interfaceXml));
  const entities = [...swcModel.entities, ...interfaceModel.entities];
  enrichPortInterfaceMetadataFromEntities(entities);
  enrichPortCommunicationSpecsFromEntities(entities);

  const port = entities.find((entity) => entity.shortName === "AeroOut");
  const communicationSpecDetails = JSON.parse(port?.metadata?.["COMMUNICATION-SPEC-DETAILS"] ?? "[]") as Array<
    Record<string, string>
  >;

  assert.equal(communicationSpecDetails[0]?.dataType, "/DataTypes/Boolean");
  assert.equal(communicationSpecDetails[0]?.measurementCalibration, "READ-WRITE");
  assert.equal(port?.metadata?.["IS-SERVICE"], "true");
});

test("buildAutosarModel enriches parameter, nv-data, mode, and trigger port details from interfaces", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <PARAMETER-INTERFACE>
          <SHORT-NAME>Param_I</SHORT-NAME>
          <PARAMETERS>
            <PARAMETER-DATA-PROTOTYPE>
              <SHORT-NAME>Gain</SHORT-NAME>
              <TYPE-TREF DEST="APPLICATION-PRIMITIVE-DATA-TYPE">/Pkg/Types/uint16</TYPE-TREF>
            </PARAMETER-DATA-PROTOTYPE>
          </PARAMETERS>
        </PARAMETER-INTERFACE>
        <NV-DATA-INTERFACE>
          <SHORT-NAME>Nv_I</SHORT-NAME>
          <IS-SERVICE>true</IS-SERVICE>
          <NV-DATAS>
            <VARIABLE-DATA-PROTOTYPE>
              <SHORT-NAME>StoredCounter</SHORT-NAME>
              <TYPE-TREF DEST="APPLICATION-PRIMITIVE-DATA-TYPE">/Pkg/Types/uint32</TYPE-TREF>
            </VARIABLE-DATA-PROTOTYPE>
          </NV-DATAS>
        </NV-DATA-INTERFACE>
        <MODE-SWITCH-INTERFACE>
          <SHORT-NAME>Mode_I</SHORT-NAME>
          <MODE-GROUP>
            <SHORT-NAME>PowerMode</SHORT-NAME>
            <TYPE-TREF DEST="MODE-DECLARATION-GROUP">/Pkg/Modes/PowerModeGroup</TYPE-TREF>
          </MODE-GROUP>
        </MODE-SWITCH-INTERFACE>
        <TRIGGER-INTERFACE>
          <SHORT-NAME>Trigger_I</SHORT-NAME>
          <TRIGGERS>
            <TRIGGER>
              <SHORT-NAME>Wakeup</SHORT-NAME>
            </TRIGGER>
          </TRIGGERS>
        </TRIGGER-INTERFACE>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>App</SHORT-NAME>
          <PORTS>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>ParamIn</SHORT-NAME>
              <REQUIRED-INTERFACE-TREF DEST="PARAMETER-INTERFACE">/Pkg/Param_I</REQUIRED-INTERFACE-TREF>
            </R-PORT-PROTOTYPE>
            <PR-PORT-PROTOTYPE>
              <SHORT-NAME>NvMirror</SHORT-NAME>
              <PROVIDED-REQUIRED-INTERFACE-TREF DEST="NV-DATA-INTERFACE">/Pkg/Nv_I</PROVIDED-REQUIRED-INTERFACE-TREF>
            </PR-PORT-PROTOTYPE>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>ModeIn</SHORT-NAME>
              <REQUIRED-INTERFACE-TREF DEST="MODE-SWITCH-INTERFACE">/Pkg/Mode_I</REQUIRED-INTERFACE-TREF>
            </R-PORT-PROTOTYPE>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>TriggerOut</SHORT-NAME>
              <PROVIDED-INTERFACE-TREF DEST="TRIGGER-INTERFACE">/Pkg/Trigger_I</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  const model = buildAutosarModel("C:/workspace/non-sr.arxml", parser.parse(xml));
  const paramPort = model.entities.find((entity) => entity.shortName === "ParamIn");
  const nvPort = model.entities.find((entity) => entity.shortName === "NvMirror");
  const modePort = model.entities.find((entity) => entity.shortName === "ModeIn");
  const triggerPort = model.entities.find((entity) => entity.shortName === "TriggerOut");

  assert.equal(paramPort?.interfaceKind, "parameter");
  assert.equal(nvPort?.interfaceKind, "nv-data");
  assert.equal(modePort?.interfaceKind, "mode-switch");
  assert.equal(triggerPort?.interfaceKind, "trigger");
  assert.equal(nvPort?.metadata?.["IS-SERVICE"], "true");
  assert.equal(paramPort?.metadata?.["INTERFACE-MEMBER-DETAILS"]?.includes('"kind":"parameter"'), true);
  assert.equal(nvPort?.metadata?.["INTERFACE-MEMBER-DETAILS"]?.includes('"kind":"nvData"'), true);
  assert.equal(modePort?.metadata?.["INTERFACE-MEMBER-DETAILS"]?.includes('"kind":"modeGroup"'), true);
  assert.equal(triggerPort?.metadata?.["INTERFACE-MEMBER-DETAILS"]?.includes('"kind":"trigger"'), true);
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
                  <TRANSMISSION-ACKNOWLEDGE>
                    <TIMEOUT>0.01</TIMEOUT>
                  </TRANSMISSION-ACKNOWLEDGE>
                </NONQUEUED-SENDER-COM-SPEC>
              </PROVIDED-COM-SPECS>
              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/Interfaces/Status_I</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>StatusIn</SHORT-NAME>
              <REQUIRED-COM-SPECS>
                <NONQUEUED-RECEIVER-COM-SPEC>
                  <DATA-ELEMENT-REF DEST="VARIABLE-DATA-PROTOTYPE">/Pkg/Interfaces/Status_I/EngineStatus</DATA-ELEMENT-REF>
                  <ALIVE-TIMEOUT>0.02</ALIVE-TIMEOUT>
                  <ENABLE-UPDATE>true</ENABLE-UPDATE>
                  <HANDLE-NEVER-RECEIVED>REPLACE</HANDLE-NEVER-RECEIVED>
                  <HANDLE-DATA-STATUS>true</HANDLE-DATA-STATUS>
                  <QUEUE-LENGTH>4</QUEUE-LENGTH>
                  <FILTER>
                    <DATA-FILTER>
                      <DATA-FILTER-TYPE>ALWAYS</DATA-FILTER-TYPE>
                    </DATA-FILTER>
                  </FILTER>
                  <USES-END-TO-END-PROTECTION>true</USES-END-TO-END-PROTECTION>
                  <USES-END-TO-END-PROTECTION-ERROR-HANDLING>true</USES-END-TO-END-PROTECTION-ERROR-HANDLING>
                  <TRANSFORMATION-COM-SPEC-PROPS>
                    <TRANSFORMATION-I-SIGNAL-PROP>
                      <TRANSFORMER-REF DEST="DATA-TRANSFORMATION">/Pkg/Transformers/StatusTransformer</TRANSFORMER-REF>
                    </TRANSFORMATION-I-SIGNAL-PROP>
                  </TRANSFORMATION-COM-SPEC-PROPS>
                  <TIMEOUT-SUBSTITUTION-VALUE>
                    <NUMERICAL-VALUE-SPECIFICATION>
                      <VALUE>0</VALUE>
                    </NUMERICAL-VALUE-SPECIFICATION>
                  </TIMEOUT-SUBSTITUTION-VALUE>
                  <HANDLE-TIMEOUT-TYPE>REPLACE</HANDLE-TIMEOUT-TYPE>
                </NONQUEUED-RECEIVER-COM-SPEC>
              </REQUIRED-COM-SPECS>
              <REQUIRED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/Interfaces/Status_I</REQUIRED-INTERFACE-TREF>
            </R-PORT-PROTOTYPE>
          </PORTS>
          <INTERNAL-BEHAVIORS>
            <SWC-INTERNAL-BEHAVIOR>
              <SHORT-NAME>EngineBehavior</SHORT-NAME>
              <PORT-API-OPTIONS>
                <PORT-API-OPTION>
                  <PORT-REF DEST="P-PORT-PROTOTYPE">/Pkg/EngineControl/StatusOut</PORT-REF>
                  <INDIRECT-API>true</INDIRECT-API>
                  <ENABLE-TAKE-ADDRESS>true</ENABLE-TAKE-ADDRESS>
                  <ERROR-HANDLING>TRANSFORMER-ERROR-HANDLING</ERROR-HANDLING>
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
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>Interfaces</SHORT-NAME>
          <ELEMENTS>
            <SENDER-RECEIVER-INTERFACE>
              <SHORT-NAME>Status_I</SHORT-NAME>
              <IS-SERVICE>true</IS-SERVICE>
              <DATA-ELEMENTS>
                <VARIABLE-DATA-PROTOTYPE>
                  <SHORT-NAME>EngineStatus</SHORT-NAME>
                  <TYPE-TREF DEST="IMPLEMENTATION-DATA-TYPE">/Pkg/DataTypes/uint8</TYPE-TREF>
                  <IS-QUEUED>false</IS-QUEUED>
                  <SW-CALIBRATION-ACCESS>READ-ONLY</SW-CALIBRATION-ACCESS>
                  <SW-DATA-DEF-PROPS>
                    <SW-DATA-DEF-PROPS-VARIANTS>
                      <SW-DATA-DEF-PROPS-CONDITIONAL>
                        <TYPE-TREF DEST="IMPLEMENTATION-DATA-TYPE">/Pkg/DataTypes/WrongNestedType</TYPE-TREF>
                        <DATA-CONSTR-REF DEST="DATA-CONSTR">/Pkg/DataConstraints/StatusConstraint</DATA-CONSTR-REF>
                        <SW-ADDR-METHOD-REF DEST="SW-ADDR-METHOD">/Pkg/MemMap/FastData</SW-ADDR-METHOD-REF>
                        <SW-CALIBRATION-ACCESS>READ-WRITE</SW-CALIBRATION-ACCESS>
                        <HANDLE-INVALID>KEEP</HANDLE-INVALID>
                      </SW-DATA-DEF-PROPS-CONDITIONAL>
                    </SW-DATA-DEF-PROPS-VARIANTS>
                  </SW-DATA-DEF-PROPS>
                </VARIABLE-DATA-PROTOTYPE>
              </DATA-ELEMENTS>
            </SENDER-RECEIVER-INTERFACE>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
