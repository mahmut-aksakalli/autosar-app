import test from "node:test";
import assert from "node:assert/strict";
import { ArxmlValidationService } from "../electron/services/arxmlValidationService.js";
import { AutosarSchemaRegistry } from "../electron/services/autosarSchemaRegistry.js";

const validAutosar42 = `<?xml version="1.0" encoding="utf-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd">
  <AR-PACKAGES></AR-PACKAGES>
</AUTOSAR>`;

test("AutosarSchemaRegistry maps schemaLocation filenames to local schema bundles", () => {
  const registry = new AutosarSchemaRegistry();
  const schema = registry.findBySchemaLocation("http://autosar.org/schema/r4.0 AUTOSAR_00054.xsd");

  assert.equal(schema?.release, "R25-11");
  assert.equal(schema?.version, "4.11.0");
  assert.equal(schema?.schemaFile, "R25-11/AUTOSAR_00054.xsd");
});

test("ArxmlValidationService validates well-formed schema-backed ARXML", async () => {
  const service = new ArxmlValidationService();
  const result = await service.validate("valid.arxml", validAutosar42, "single-file");

  assert.equal(result.canParseModel, true);
  assert.equal(result.metadata.scope, "single-file");
  assert.equal(result.metadata.completeness, "partial");
  assert.equal(result.metadata.autosarRelease, "R4.2.2");
  assert.equal(result.metadata.schemaFile, "R4.2.2/AUTOSAR_4-2-2.xsd");
  assert.equal(result.issues.length, 0);
});

test("ArxmlValidationService reports malformed XML without throwing", async () => {
  const service = new ArxmlValidationService();
  const result = await service.validate("broken.arxml", "<AUTOSAR><AR-PACKAGES></AUTOSAR>", "single-file");

  assert.equal(result.canParseModel, false);
  assert.equal(result.metadata.completeness, "not-validated");
  assert.equal(result.issues.some((issue) => issue.category === "syntax" && issue.severity === "error"), true);
  assert.equal(result.issues.every((issue) => issue.filePath === "broken.arxml"), true);
});

test("ArxmlValidationService reports missing namespace and schema location separately", async () => {
  const service = new ArxmlValidationService();
  const result = await service.validate("missing-metadata.arxml", "<AUTOSAR><AR-PACKAGES /></AUTOSAR>", "single-file");

  assert.equal(result.canParseModel, true);
  assert.equal(result.issues.some((issue) => issue.code === "missing-autosar-namespace"), true);
  assert.equal(result.issues.some((issue) => issue.code === "missing-schema-location"), true);
});

test("ArxmlValidationService reports wrong AUTOSAR namespaces", async () => {
  const service = new ArxmlValidationService();
  const xml = validAutosar42.replace("http://autosar.org/schema/r4.0", "http://example.com/not-autosar");
  const result = await service.validate("wrong-namespace.arxml", xml, "single-file");

  assert.equal(result.issues.some((issue) => issue.code === "unsupported-autosar-namespace"), true);
});

test("ArxmlValidationService reports malformed schemaLocation shape", async () => {
  const service = new ArxmlValidationService();
  const xml = validAutosar42.replace(
    'xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd"',
    'xsi:schemaLocation="http://autosar.org/schema/r4.0"'
  );
  const result = await service.validate("odd-schema-location.arxml", xml, "single-file");

  assert.equal(result.issues.some((issue) => issue.code === "invalid-schema-location-format"), true);
});

test("ArxmlValidationService reports unsupported schema locations", async () => {
  const service = new ArxmlValidationService();
  const xml = validAutosar42.replace("AUTOSAR_4-2-2.xsd", "AUTOSAR_9-9-9.xsd");
  const result = await service.validate("unsupported-schema.arxml", xml, "workspace");

  assert.equal(result.metadata.scope, "workspace");
  assert.equal(result.metadata.completeness, "complete");
  assert.equal(result.metadata.schemaFile, undefined);
  assert.equal(result.issues.some((issue) => issue.code === "unsupported-schema-location"), true);
});

test("ArxmlValidationService reports XSD structural errors", async () => {
  const service = new ArxmlValidationService();
  const xml = validAutosar42.replace("<AR-PACKAGES></AR-PACKAGES>", "<NOT-AUTOSAR></NOT-AUTOSAR>");
  const result = await service.validate("schema-invalid.arxml", xml, "single-file");

  assert.equal(result.canParseModel, true);
  assert.equal(result.issues.some((issue) => issue.category === "schema" && issue.severity === "error"), true);
});
