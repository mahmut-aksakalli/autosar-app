import { workerData, parentPort } from "node:worker_threads";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { buildAutosarModel } from "../autosarModel.js";
import { ArxmlValidationService } from "../arxmlValidationService.js";
import type { ArxmlDocumentData, ValidationScope } from "../../../src/shared/contracts.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  allowBooleanAttributes: true
});

const validationService = new ArxmlValidationService();

async function parseDocument(
  filePath: string,
  content: string,
  validationScope: ValidationScope,
  validationEnabled: boolean
): Promise<ArxmlDocumentData> {
  const validation = validationEnabled
    ? await validationService.validate(filePath, content, validationScope)
    : createNotValidatedResult(filePath, validationScope);

  if (!validation.canParseModel) {
    return {
      filePath,
      content,
      relativePath: filePath,
      rootTag: validation.metadata.rootTag ?? "UNKNOWN",
      shortName: path.basename(filePath),
      entities: [],
      connections: [],
      structuredFields: [
        { key: "ROOT-TAG", value: validation.metadata.rootTag ?? "UNKNOWN", category: "Document", editable: false }
      ],
      validationIssues: validation.issues,
      validation: validation.metadata,
      entityCount: 0
    };
  }

  const parsed = parser.parse(content);
  const model = buildAutosarModel(filePath, parsed, {
    validation: validation.metadata,
    validationScope
  });
  const validationIssues = validationEnabled ? [...validation.issues, ...model.validationIssues] : [];
  return {
    filePath,
    content,
    relativePath: filePath,
    rootTag: model.rootTag,
    shortName: model.shortName,
    entities: model.entities,
    connections: model.connections,
    structuredFields: model.structuredFields,
    validationIssues,
    validation: validation.metadata,
    entityCount: model.entities.length
  };
}
const request = workerData as {
  type: "parse";
  filePath: string;
  content: string;
  validationScope: ValidationScope;
  validationEnabled?: boolean;
};

const response = await parseDocument(
  request.filePath,
  request.content,
  request.validationScope,
  request.validationEnabled === true
);

parentPort?.postMessage(response);

function createNotValidatedResult(filePath: string, scope: ValidationScope) {
  return {
    metadata: {
      scope,
      completeness: "not-validated" as const,
      rootTag: "AUTOSAR",
      validatedAt: new Date().toISOString()
    },
    issues: [],
    canParseModel: true
  };
}
