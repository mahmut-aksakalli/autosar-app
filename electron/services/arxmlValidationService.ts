import { XMLValidator } from "fast-xml-parser";
import type {
  ArxmlValidationMetadata,
  ValidationCompleteness,
  ValidationIssue,
  ValidationScope
} from "../../src/shared/contracts.js";
import { AutosarSchemaRegistry, type AutosarSchemaSelection } from "./autosarSchemaRegistry.js";
import { WasmXsdValidationEngine } from "./xsdValidationEngine.js";

export interface ArxmlValidationResult {
  metadata: ArxmlValidationMetadata;
  issues: ValidationIssue[];
  canParseModel: boolean;
}

interface RootMetadata {
  rootTag?: string;
  rootPrefix?: string;
  namespace?: string;
  schemaLocation?: string;
  xsiNamespace?: string;
  namespaceDeclarations: Array<{ name: string; value: string }>;
}

export class ArxmlValidationService {
  private readonly schemaRegistry = new AutosarSchemaRegistry();
  private readonly xsdValidationEngine = new WasmXsdValidationEngine();

  async validate(filePath: string, content: string, scope: ValidationScope): Promise<ArxmlValidationResult> {
    const issues: ValidationIssue[] = [];
    const validatedAt = new Date().toISOString();
    const rootMetadata = extractRootMetadata(content);
    const syntaxIssue = validateWellFormedXml(content);
    if (syntaxIssue) {
      issues.push(syntaxIssue);
    }

    issues.push(...validateNamespace(rootMetadata, this.schemaRegistry.namespace));
    const schemaSelection = this.schemaRegistry.findBySchemaLocation(rootMetadata.schemaLocation);
    issues.push(...validateSchemaLocation(rootMetadata, schemaSelection));
    issues.push(...validateSerializationRules(rootMetadata, this.schemaRegistry.namespace));

    const hasBlockingNamespaceIssue = issues.some((issue) => issue.category === "namespace" && issue.severity === "error");
    if (!syntaxIssue && !hasBlockingNamespaceIssue && schemaSelection) {
      issues.push(...(await this.validateAgainstXsd(filePath, content, schemaSelection)));
    }

    const normalizedIssues = issues.map((issue): ValidationIssue => ({ ...issue, filePath }));
    const hasBlockingSyntaxIssue = normalizedIssues.some((issue) => issue.category === "syntax" && issue.severity === "error");
    const completeness = getCompleteness(scope, hasBlockingSyntaxIssue);
    return {
      metadata: {
        scope,
        completeness,
        rootTag: rootMetadata.rootTag,
        namespace: rootMetadata.namespace,
        schemaLocation: rootMetadata.schemaLocation,
        autosarRelease: schemaSelection?.release,
        autosarVersion: schemaSelection?.version,
        schemaFile: schemaSelection?.schemaFile,
        validatedAt
      },
      issues: normalizedIssues,
      canParseModel: !hasBlockingSyntaxIssue
    };
  }

  private async validateAgainstXsd(
    filePath: string,
    content: string,
    schema: AutosarSchemaSelection
  ): Promise<ValidationIssue[]> {
    return this.xsdValidationEngine.validate({ filePath, content, schema });
  }
}

function validateWellFormedXml(content: string): ValidationIssue | undefined {
  const result = XMLValidator.validate(content, {
    allowBooleanAttributes: true
  });
  if (result === true) {
    return undefined;
  }

  return {
    severity: "error",
    category: "syntax",
    code: "xml-not-well-formed",
    source: "xml-parser",
    message: result.err.msg,
    line: result.err.line,
    column: result.err.col
  };
}

function extractRootMetadata(content: string): RootMetadata {
  const withoutDeclaration = content.replace(/^\s*<\?xml[\s\S]*?\?>/, "");
  const match = /<([A-Za-z_][\w:.-]*)([^<>]*)>/m.exec(withoutDeclaration);
  const rootName = match?.[1];
  const rootAttributes = match?.[2] ?? "";
  const attributes = new Map<string, string>();
  const namespaceDeclarations: Array<{ name: string; value: string }> = [];
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(rootAttributes))) {
    const name = attrMatch[1] ?? "";
    const value = attrMatch[3] ?? "";
    attributes.set(name, value);
    if (name === "xmlns" || name.startsWith("xmlns:")) {
      namespaceDeclarations.push({ name, value });
    }
  }

  const [rootPrefix, localRootName] = splitPrefixedName(rootName);
  const prefixNamespace = rootPrefix ? attributes.get(`xmlns:${rootPrefix}`) : undefined;
  return {
    rootTag: localRootName,
    rootPrefix,
    namespace: prefixNamespace ?? attributes.get("xmlns"),
    schemaLocation: attributes.get("xsi:schemaLocation"),
    xsiNamespace: attributes.get("xmlns:xsi"),
    namespaceDeclarations
  };
}

function validateNamespace(root: RootMetadata, autosarNamespace: string) {
  const issues: ValidationIssue[] = [];
  if (!root.rootTag) {
    issues.push({
      severity: "error",
      category: "namespace",
      code: "missing-root-element",
      source: "namespace",
      message: "No XML root element was found."
    });
    return issues;
  }

  if (root.rootTag !== "AUTOSAR") {
    issues.push({
      severity: "error",
      category: "namespace",
      code: "invalid-root-element",
      source: "namespace",
      message: `Expected AUTOSAR root element but found ${root.rootTag}.`,
      path: `/${root.rootTag}`
    });
  }

  if (!root.namespace) {
    issues.push({
      severity: "warning",
      category: "namespace",
      code: "missing-autosar-namespace",
      source: "namespace",
      message: "The AUTOSAR root element does not declare the AUTOSAR namespace.",
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
  } else if (root.namespace !== autosarNamespace) {
    issues.push({
      severity: "error",
      category: "namespace",
      code: "unsupported-autosar-namespace",
      source: "namespace",
      message: `Unsupported AUTOSAR namespace ${root.namespace}. Expected ${autosarNamespace}.`,
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
  }

  if (root.rootPrefix) {
    issues.push({
      severity: "warning",
      category: "namespace",
      code: "prefixed-autosar-root",
      source: "namespace",
      message: "AUTOSAR ARXML should use the AUTOSAR namespace as the default namespace, not a prefixed root element.",
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
  }

  return issues;
}

function validateSchemaLocation(root: RootMetadata, schemaSelection: AutosarSchemaSelection | undefined) {
  const issues: ValidationIssue[] = [];
  if (!root.schemaLocation) {
    issues.push({
      severity: "warning",
      category: "schema",
      code: "missing-schema-location",
      source: "xsd",
      message: "No xsi:schemaLocation was declared, so AUTOSAR XSD validation was skipped.",
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
    return issues;
  }

  if (!root.xsiNamespace) {
    issues.push({
      severity: "warning",
      category: "serialization",
      code: "missing-xsi-namespace",
      source: "serialization",
      message: "xsi:schemaLocation is present but xmlns:xsi is not declared on the root element.",
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
  }

  if (!schemaSelection) {
    issues.push({
      severity: "warning",
      category: "schema",
      code: "unsupported-schema-location",
      source: "xsd",
      message: `No local AUTOSAR schema was found for xsi:schemaLocation "${root.schemaLocation}".`,
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
  }

  return issues;
}

function validateSerializationRules(root: RootMetadata, autosarNamespace: string) {
  const issues: ValidationIssue[] = [];
  for (const declaration of root.namespaceDeclarations) {
    if (declaration.name === "xmlns" && declaration.value === autosarNamespace) {
      continue;
    }
    if (declaration.name === "xmlns:xsi" && declaration.value === "http://www.w3.org/2001/XMLSchema-instance") {
      continue;
    }
    if (declaration.name === "xmlns:xml" && declaration.value === "http://www.w3.org/XML/1998/namespace") {
      continue;
    }
    issues.push({
      severity: "warning",
      category: "serialization",
      code: "extra-namespace",
      source: "serialization",
      message: `Unexpected namespace declaration ${declaration.name}="${declaration.value}" on AUTOSAR root.`,
      path: root.rootTag ? `/${root.rootTag}` : undefined
    });
  }

  if (root.schemaLocation) {
    const tokens = root.schemaLocation.split(/\s+/).filter(Boolean);
    if (tokens.length % 2 !== 0) {
      issues.push({
        severity: "warning",
        category: "serialization",
        code: "invalid-schema-location-format",
        source: "serialization",
        message: "xsi:schemaLocation should contain namespace/schema path pairs.",
        path: root.rootTag ? `/${root.rootTag}` : undefined
      });
    }
  }

  return issues;
}

function getCompleteness(scope: ValidationScope, hasBlockingSyntaxIssue: boolean): ValidationCompleteness {
  if (hasBlockingSyntaxIssue) {
    return "not-validated";
  }
  if (scope === "single-file") {
    return "partial";
  }
  return "complete";
}

function splitPrefixedName(name: string | undefined): [string | undefined, string | undefined] {
  if (!name) {
    return [undefined, undefined];
  }
  const index = name.indexOf(":");
  if (index === -1) {
    return [undefined, name];
  }
  return [name.slice(0, index), name.slice(index + 1)];
}
