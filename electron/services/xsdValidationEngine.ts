import path from "node:path";
import { memoryPages, validateXML, type XMLValidationError } from "xmllint-wasm";
import type { ValidationIssue } from "../../src/shared/contracts.js";
import type { AutosarSchemaSelection } from "./autosarSchemaRegistry.js";

export interface XsdValidationRequest {
  content: string;
  filePath: string;
  schema: AutosarSchemaSelection;
}

export class WasmXsdValidationEngine {
  async validate({ content, filePath, schema }: XsdValidationRequest): Promise<ValidationIssue[]> {
    try {
      const [schemaSource, sharedXmlSchemaSource] = await Promise.all([
        readFileText(schema.schemaPath),
        schema.sharedXmlSchemaPath ? readFileText(schema.sharedXmlSchemaPath) : Promise.resolve(undefined)
      ]);

      const result = await validateXML({
        xml: {
          fileName: safeFileName(filePath, "document.arxml"),
          contents: content
        },
        schema: {
          fileName: safeFileName(schema.schemaFile, "autosar.xsd"),
          contents: schemaSource
        },
        preload: sharedXmlSchemaSource
          ? {
              fileName: "xml.xsd",
              contents: sharedXmlSchemaSource
            }
          : undefined,
        initialMemoryPages: 64 * memoryPages.MiB,
        maxMemoryPages: 512 * memoryPages.MiB
      });

      return result.valid ? [] : result.errors.map((error) => errorToIssue(error, schema.schemaFile));
    } catch (error) {
      return [
        {
          severity: "error",
          category: "schema",
          code: "xsd-validation-failed",
          source: "xsd",
          schemaFile: schema.schemaFile,
          message: error instanceof Error ? error.message : String(error)
        }
      ];
    }
  }
}

async function readFileText(filePath: string) {
  const fs = await import("node:fs/promises");
  return fs.readFile(filePath, "utf8");
}

function safeFileName(filePath: string, fallback: string) {
  const baseName = path.basename(filePath.replace(/\\/g, "/"));
  return baseName && !baseName.startsWith("-") ? baseName : fallback;
}

function errorToIssue(error: XMLValidationError, schemaFile: string): ValidationIssue {
  return {
    severity: "error",
    category: "schema",
    code: "xsd-validation",
    source: "xsd",
    schemaFile,
    message: error.message.trim() || error.rawMessage.trim() || "ARXML does not conform to the selected AUTOSAR XSD.",
    line: error.loc?.lineNumber
  };
}
