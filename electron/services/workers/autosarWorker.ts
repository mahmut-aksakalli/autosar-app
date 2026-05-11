import { workerData, parentPort } from "node:worker_threads";
import { XMLParser } from "fast-xml-parser";
import { buildAutosarModel } from "../autosarModel.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  allowBooleanAttributes: true
});

function parseDocument(filePath: string, content: string) {
  const parsed = parser.parse(content);
  const model = buildAutosarModel(filePath, parsed);
  return {
    filePath,
    content,
    relativePath: filePath,
    rootTag: model.rootTag,
    shortName: model.shortName,
    entities: model.entities,
    connections: model.connections,
    structuredFields: model.structuredFields,
    validationIssues: model.validationIssues,
    entityCount: model.entities.length
  };
}
const request = workerData as { type: "parse"; filePath: string; content: string };

const response = parseDocument(request.filePath, request.content);

parentPort?.postMessage(response);
