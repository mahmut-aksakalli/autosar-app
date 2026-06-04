import type {
  ArxmlDocumentData,
  AutosarEntity,
  PortConnection,
  ReferenceResolutionStatus,
  ValidationIssue,
  ValidationScope
} from "../../src/shared/contracts.js";

type ExpectedEntityType = "swc" | "composition" | "instance" | "port" | "interface";

interface SemanticReference {
  filePath: string;
  xmlPath?: string;
  semanticPath?: string;
  referenceValue: string;
  expectedTypes: ExpectedEntityType[];
  code: string;
  messagePrefix: string;
}

interface IndexedEntity {
  entity: AutosarEntity;
  ambiguous: boolean;
}

export class AutosarSemanticValidationService {
  validateDocuments(documents: ArxmlDocumentData[], scope: ValidationScope): ArxmlDocumentData[] {
    const index = this.buildIndex(documents);
    const scopeByFilePath = new Map(
      documents.map((document) => [document.filePath, document.validation.scope ?? scope])
    );
    const issuesByFile = new Map<string, ValidationIssue[]>();

    for (const issue of this.validateDuplicateSemanticPaths(index.duplicates, scope)) {
      addIssue(issuesByFile, issue);
    }

    for (const reference of this.collectReferences(documents)) {
      const referenceScope = scopeByFilePath.get(reference.filePath) ?? scope;
      addIssueIfPresent(issuesByFile, this.validateReference(reference, index.entitiesBySemanticPath, referenceScope));
    }

    return documents.map((document) => ({
      ...document,
      validationIssues: [
        ...document.validationIssues.filter((issue) => issue.category !== "semantic"),
        ...(issuesByFile.get(document.filePath) ?? [])
      ]
    }));
  }

  private buildIndex(documents: ArxmlDocumentData[]) {
    const entitiesBySemanticPath = new Map<string, IndexedEntity>();
    const duplicates = new Map<string, AutosarEntity[]>();

    for (const entity of documents.flatMap((document) => document.entities)) {
      if (!entity.semanticPath) {
        continue;
      }

      const existing = entitiesBySemanticPath.get(entity.semanticPath);
      if (!existing) {
        entitiesBySemanticPath.set(entity.semanticPath, { entity, ambiguous: false });
        continue;
      }

      const duplicateEntries = duplicates.get(entity.semanticPath) ?? [existing.entity];
      duplicateEntries.push(entity);
      duplicates.set(entity.semanticPath, duplicateEntries);
      entitiesBySemanticPath.set(entity.semanticPath, { entity: existing.entity, ambiguous: true });
    }

    return { entitiesBySemanticPath, duplicates };
  }

  private validateDuplicateSemanticPaths(duplicates: Map<string, AutosarEntity[]>, scope: ValidationScope) {
    const issues: ValidationIssue[] = [];
    for (const [semanticPath, entities] of duplicates.entries()) {
      entities.forEach((entity) => {
        issues.push({
          severity: "error",
          category: "semantic",
          source: "autosar-model",
          code: "ARXML_SEMANTIC_DUPLICATE_PATH",
          message: `Duplicate AUTOSAR semantic path ${semanticPath}.`,
          filePath: entity.filePath,
          path: entity.xmlPath,
          semanticPath,
          relatedTargetPath: semanticPath,
          referenceStatus: "ambiguous",
          validationScope: scope
        });
      });
    }
    return issues;
  }

  private collectReferences(documents: ArxmlDocumentData[]) {
    const references: SemanticReference[] = [];

    for (const document of documents) {
      for (const entity of document.entities) {
        if (!entity.typeRef) {
          continue;
        }

        if (entity.type === "port") {
          references.push({
            filePath: entity.filePath,
            xmlPath: entity.xmlPath,
            semanticPath: entity.semanticPath,
            referenceValue: entity.typeRef,
            expectedTypes: ["interface"],
            code: "ARXML_SEMANTIC_PORT_INTERFACE_REF",
            messagePrefix: `Port ${entity.shortName} references interface`
          });
        } else if (entity.type === "instance") {
          references.push({
            filePath: entity.filePath,
            xmlPath: entity.xmlPath,
            semanticPath: entity.semanticPath,
            referenceValue: entity.typeRef,
            expectedTypes: ["swc", "composition"],
            code: "ARXML_SEMANTIC_COMPONENT_TYPE_REF",
            messagePrefix: `Component prototype ${entity.shortName} references component type`
          });
        }
      }

      document.connections.forEach((connection) => {
        references.push(...this.collectConnectionReferences(connection));
      });
    }

    return references;
  }

  private collectConnectionReferences(connection: PortConnection) {
    const references: SemanticReference[] = [];
    const common = {
      filePath: connection.filePath,
      xmlPath: connection.xmlPath,
      semanticPath: connection.xmlPath
    };

    if (connection.providerComponentRef) {
      references.push({
        ...common,
        referenceValue: connection.providerComponentRef,
        expectedTypes: ["instance"],
        code: "ARXML_SEMANTIC_CONNECTOR_COMPONENT_REF",
        messagePrefix: `Connector ${connection.label} references provider component`
      });
    }
    if (connection.requesterComponentRef) {
      references.push({
        ...common,
        referenceValue: connection.requesterComponentRef,
        expectedTypes: ["instance"],
        code: "ARXML_SEMANTIC_CONNECTOR_COMPONENT_REF",
        messagePrefix: `Connector ${connection.label} references requester component`
      });
    }
    if (connection.sourcePortRef) {
      references.push({
        ...common,
        referenceValue: connection.sourcePortRef,
        expectedTypes: ["port"],
        code: "ARXML_SEMANTIC_CONNECTOR_PORT_REF",
        messagePrefix: `Connector ${connection.label} references source port`
      });
    }
    if (connection.targetPortRef) {
      references.push({
        ...common,
        referenceValue: connection.targetPortRef,
        expectedTypes: ["port"],
        code: "ARXML_SEMANTIC_CONNECTOR_PORT_REF",
        messagePrefix: `Connector ${connection.label} references target port`
      });
    }
    if (connection.outerPortRef) {
      references.push({
        ...common,
        referenceValue: connection.outerPortRef,
        expectedTypes: ["port"],
        code: "ARXML_SEMANTIC_CONNECTOR_PORT_REF",
        messagePrefix: `Connector ${connection.label} references outer port`
      });
    }

    return references;
  }

  private validateReference(
    reference: SemanticReference,
    entitiesBySemanticPath: Map<string, IndexedEntity>,
    scope: ValidationScope
  ): ValidationIssue | undefined {
    const indexed = entitiesBySemanticPath.get(reference.referenceValue);
    if (!indexed) {
      return this.createReferenceIssue(reference, {
        scope,
        status: scope === "single-file" ? "external" : "unresolved",
        severity: scope === "single-file" ? "warning" : "error",
        message:
          scope === "single-file"
            ? `${reference.messagePrefix} ${reference.referenceValue}, which is outside the currently opened file.`
            : `${reference.messagePrefix} ${reference.referenceValue}, but it was not found in the loaded workspace.`
      });
    }

    if (indexed.ambiguous) {
      return this.createReferenceIssue(reference, {
        scope,
        status: "ambiguous",
        severity: "error",
        message: `${reference.messagePrefix} ${reference.referenceValue}, but that semantic path is ambiguous.`
      });
    }

    if (!reference.expectedTypes.includes(indexed.entity.type as ExpectedEntityType)) {
      return this.createReferenceIssue(reference, {
        scope,
        status: "wrong-kind",
        severity: "error",
        message: `${reference.messagePrefix} ${reference.referenceValue}, but resolved to ${indexed.entity.type} instead of ${reference.expectedTypes.join(" or ")}.`
      });
    }

    return undefined;
  }

  private createReferenceIssue(
    reference: SemanticReference,
    options: {
      scope: ValidationScope;
      status: ReferenceResolutionStatus;
      severity: "warning" | "error";
      message: string;
    }
  ): ValidationIssue {
    return {
      severity: options.severity,
      category: "semantic",
      source: "autosar-model",
      code: reference.code,
      message: options.message,
      filePath: reference.filePath,
      path: reference.xmlPath,
      semanticPath: reference.semanticPath,
      relatedTargetPath: reference.referenceValue,
      referenceValue: reference.referenceValue,
      expectedDestination: reference.expectedTypes.join("|"),
      referenceStatus: options.status,
      validationScope: options.scope
    };
  }
}

function addIssue(issuesByFile: Map<string, ValidationIssue[]>, issue: ValidationIssue) {
  const filePath = issue.filePath;
  if (!filePath) {
    return;
  }
  const issues = issuesByFile.get(filePath) ?? [];
  issues.push(issue);
  issuesByFile.set(filePath, issues);
}

function addIssueIfPresent(issuesByFile: Map<string, ValidationIssue[]>, issue: ValidationIssue | undefined) {
  if (issue) {
    addIssue(issuesByFile, issue);
  }
}
