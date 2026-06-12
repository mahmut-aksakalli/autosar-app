import { workerData, parentPort } from "node:worker_threads";
import type { ValidationScope } from "../../../src/shared/contracts.js";
import { parseAutosarDocument } from "../autosarParserService.js";

const request = workerData as {
  type: "parse";
  filePath: string;
  content: string;
  validationScope: ValidationScope;
  validationEnabled?: boolean;
};

const response = await parseAutosarDocument(
  request.filePath,
  request.content,
  request.validationScope,
  request.validationEnabled === true
);

parentPort?.postMessage(response);
