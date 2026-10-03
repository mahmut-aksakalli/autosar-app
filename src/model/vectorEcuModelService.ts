import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type {
  ArxmlDocumentData,
  AutosarEntity,
  SwcGraphExternalConnection,
  SwcGraphNode,
  VectorEcuInstanceMapping,
  VectorEcuModel,
  VectorEcuPortMapping,
  WorkspaceProjectInfo,
  WorkspaceSnapshot
} from "../shared/contracts";

const flatMapParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

/** Keeps the generated ECU extract separate from the authored model entities. */
export function buildVectorEcuModel(
  documents: ArxmlDocumentData[],
  project: WorkspaceProjectInfo
): VectorEcuModel | undefined {
  const flatExtractPath = project.vectorEcuInputs?.flatExtractFilePath;
  const flatMapPath = project.vectorEcuInputs?.flatMapFilePath;
  if (!flatExtractPath || !flatMapPath) {
    return undefined;
  }

  const flatDocument = documents.find((document) => samePath(document.filePath, flatExtractPath));
  const flatMapDocument = documents.find((document) => samePath(document.filePath, flatMapPath));
  if (!flatDocument || !flatMapDocument) {
    return undefined;
  }

  const developerDocuments = documents.filter((document) => !samePath(document.filePath, flatExtractPath));
  const rootPrototype = developerDocuments
    .filter((document) => document.relativePath.split(/[\\/]/).some((part) => part.toLowerCase() === "ecuprojects"))
    .map((document) => readRootCompositionPrototype(document.content))
    .find((reference) => Boolean(reference));
  const developerComposition = rootPrototype
    ? developerDocuments.flatMap((document) => document.entities)
      .find((entity) => entity.type === "composition" && entity.semanticPath === rootPrototype.typePath)
    : undefined;
  const flatComposition = flatDocument.entities.find((entity) => entity.type === "composition");
  if (!developerComposition || !flatComposition) {
    return undefined;
  }

  const { instanceMappings, portMappings } = readFlatMap(flatMapDocument.content);
  return {
    rootCompositionId: developerComposition.id,
    rootPrototypeName: rootPrototype?.name ?? developerComposition.shortName,
    flatCompositionId: flatComposition.id,
    flatEntities: flatDocument.entities,
    flatConnections: flatDocument.connections,
    instanceMappings,
    portMappings
  };
}

/** Flat-only instances are virtual children of the declared root composition. */
export function getRootServiceInstances(workspace: WorkspaceSnapshot): AutosarEntity[] {
  const model = workspace.vectorEcu;
  if (!model) {
    return [];
  }
  const mappedFlatPaths = new Set(model.instanceMappings.map((mapping) => mapping.flatInstancePath));
  const serviceTypePaths = new Set(
    workspace.entities
      .filter((entity) => entity.swcKind === "service" || entity.swcKind === "service-proxy")
      .map((entity) => entity.semanticPath)
  );
  return model.flatEntities.filter((entity) => {
    return entity.type === "instance" &&
      Boolean(entity.semanticPath) &&
      !mappedFlatPaths.has(entity.semanticPath!) &&
      serviceTypePaths.has(entity.typeRef);
  });
}

export function getCompositionOccurrenceName(
  workspace: WorkspaceSnapshot,
  templateName: string,
  contextPaths: string[] | undefined
) {
  if (!contextPaths) {
    return templateName;
  }
  const instancePath = contextPaths.at(-1);
  if (!instancePath) {
    return workspace.vectorEcu?.rootPrototypeName ?? templateName;
  }
  const instance = workspace.entities.find((entity) => {
    return entity.type === "instance" && entity.semanticPath === instancePath;
  });
  return instance?.shortName ?? instancePath.split("/").at(-1) ?? templateName;
}

/** Resolves service links for one concrete composition occurrence, never its type alone. */
export function buildNestedServiceConnections(
  workspace: WorkspaceSnapshot,
  nodes: Map<string, SwcGraphNode>,
  contextPaths: string[]
): SwcGraphExternalConnection[] {
  const model = workspace.vectorEcu;
  if (!model) {
    return [];
  }
  const servicesByPath = new Map(
    getRootServiceInstances(workspace)
      .filter((instance) => instance.semanticPath)
      .map((instance) => [instance.semanticPath!, instance])
  );
  const nodesByPath = new Map(
    Array.from(nodes.values())
      .filter((node) => node.kind === "instance" && node.semanticPath)
      .map((node) => [node.semanticPath!, node])
  );
  const nodesByFlatPath = new Map<string, SwcGraphNode>();
  for (const mapping of model.instanceMappings) {
    if (!sameContext(mapping.upstreamContextPaths, contextPaths)) {
      continue;
    }
    const node = nodesByPath.get(mapping.upstreamInstancePath);
    if (node) {
      nodesByFlatPath.set(mapping.flatInstancePath, node);
    }
  }

  const portByPath = new Map(
    workspace.entities.filter((entity) => entity.type === "port" && entity.semanticPath)
      .map((entity) => [entity.semanticPath!, entity])
  );
  const connections: SwcGraphExternalConnection[] = [];
  for (const connection of model.flatConnections) {
    if (connection.kind !== "assembly") {
      continue;
    }
    const providerService = servicesByPath.get(connection.providerComponentRef ?? "");
    const requesterService = servicesByPath.get(connection.requesterComponentRef ?? "");
    const service = providerService ?? requesterService;
    const innerFlatPath = providerService ? connection.requesterComponentRef : connection.providerComponentRef;
    const innerPortPath = providerService ? connection.targetPortRef : connection.sourcePortRef;
    const servicePortPath = providerService ? connection.sourcePortRef : connection.targetPortRef;
    const innerNode = nodesByFlatPath.get(innerFlatPath ?? "");
    const innerPort = innerNode?.ports.find((port) => port.semanticPath === innerPortPath);
    if (!service || !innerNode || !innerPort || !servicePortPath) {
      continue;
    }
    connections.push({
      nodeId: innerNode.id,
      portId: innerPort.id,
      componentName: service.shortName,
      portName: portByPath.get(servicePortPath)?.shortName ?? servicePortPath.split("/").at(-1) ?? servicePortPath,
      category: "service",
      targetCompositionId: model.rootCompositionId,
      targetNodeId: service.id,
      targetPortId: portByPath.get(servicePortPath)?.id ?? servicePortPath
    });
  }
  return connections;
}

/** Show the reverse side of nested service links on the root service instance. */
export function buildRootServiceExternalConnections(
  workspace: WorkspaceSnapshot,
  nodes: Map<string, SwcGraphNode>
): SwcGraphExternalConnection[] {
  const model = workspace.vectorEcu;
  if (!model) {
    return [];
  }

  const serviceNodesByPath = new Map(
    getRootServiceInstances(workspace)
      .filter((instance) => instance.semanticPath && nodes.has(instance.id))
      .map((instance) => [instance.semanticPath!, nodes.get(instance.id)!])
  );
  const nestedMappingsByFlatPath = new Map(
    model.instanceMappings
      .filter((mapping) => mapping.upstreamContextPaths.length > 0)
      .map((mapping) => [mapping.flatInstancePath, mapping])
  );
  const entitiesByPath = new Map(
    workspace.entities
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath!, entity])
  );
  const connections: SwcGraphExternalConnection[] = [];

  for (const connection of model.flatConnections) {
    if (connection.kind !== "assembly") {
      continue;
    }
    const providerService = serviceNodesByPath.get(connection.providerComponentRef ?? "");
    const requesterService = serviceNodesByPath.get(connection.requesterComponentRef ?? "");
    const serviceNode = providerService ?? requesterService;
    const innerFlatPath = providerService ? connection.requesterComponentRef : connection.providerComponentRef;
    const servicePortPath = providerService ? connection.sourcePortRef : connection.targetPortRef;
    const innerPortPath = providerService ? connection.targetPortRef : connection.sourcePortRef;
    const mapping = nestedMappingsByFlatPath.get(innerFlatPath ?? "");
    const innerInstance = entitiesByPath.get(mapping?.upstreamInstancePath ?? "");
    const parentComposition = entitiesByPath.get(innerInstance?.parentSemanticPath ?? "");
    const innerPort = entitiesByPath.get(innerPortPath ?? "");
    const servicePort = serviceNode?.ports.find((port) => port.semanticPath === servicePortPath);
    if (!serviceNode || !servicePort || !mapping || innerInstance?.type !== "instance" ||
        parentComposition?.type !== "composition" || innerPort?.type !== "port") {
      continue;
    }

    connections.push({
      nodeId: serviceNode.id,
      portId: servicePort.id,
      componentName: innerInstance.shortName,
      portName: innerPort.shortName,
      category: "service",
      targetCompositionId: parentComposition.id,
      targetCompositionContextPaths: mapping.upstreamContextPaths,
      targetTreeNodeId: `${parentComposition.id}:${mapping.upstreamContextPaths.join(":")}:${innerInstance.id}`,
      targetNodeId: innerInstance.id,
      targetPortId: innerPort.id
    });
  }
  return connections;
}

function sameContext(left: string[], right: string[]) {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function readRootCompositionPrototype(content: string): { typePath: string; name: string } | undefined {
  let parsed: unknown;
  try {
    parsed = flatMapParser.parse(content);
  } catch {
    return undefined;
  }

  let rootPrototype: { typePath: string; name: string } | undefined;
  function visit(node: unknown) {
    if (rootPrototype) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = asRecord(node);
    if (!record) {
      return;
    }

    const rootPrototypes = asArray(record["ROOT-SW-COMPOSITION-PROTOTYPE"]);
    for (const prototype of rootPrototypes) {
      const prototypeRecord = asRecord(prototype);
      const reference = prototypeRecord?.["SOFTWARE-COMPOSITION-TREF"];
      let typePath: string | undefined;
      if (typeof reference === "string") {
        typePath = reference;
      } else {
        typePath = getXmlText(asRecord(reference));
      }
      if (typePath) {
        rootPrototype = {
          typePath,
          name: String(prototypeRecord?.["SHORT-NAME"] ?? typePath.split("/").at(-1) ?? typePath)
        };
        return;
      }
    }
    Object.values(record).forEach(visit);
  }
  visit(parsed);
  return rootPrototype;
}

function readFlatMap(content: string) {
  const instanceMappings: VectorEcuInstanceMapping[] = [];
  const portMappings: VectorEcuPortMapping[] = [];
  let parsed: unknown;
  try {
    parsed = flatMapParser.parse(content);
  } catch {
    return { instanceMappings, portMappings };
  }

  visitDescriptors(parsed, (descriptor) => {
    const extractReference = asRecord(descriptor["ECU-EXTRACT-REFERENCE-IREF"]);
    const upstreamReference = asRecord(descriptor["UPSTREAM-REFERENCE-IREF"]);
    const flatTarget = asRecord(extractReference?.["TARGET-REF"]);
    const upstreamTarget = asRecord(upstreamReference?.["TARGET-REF"]);
    const flatPath = getXmlText(flatTarget);
    const upstreamPath = getXmlText(upstreamTarget);
    if (!flatPath || !upstreamPath) {
      return;
    }

    if (flatTarget?.["@_DEST"] === "SW-COMPONENT-PROTOTYPE") {
      const contexts = asArray(upstreamReference?.["CONTEXT-ELEMENT-REF"]);
      instanceMappings.push({
        flatInstancePath: flatPath,
        upstreamInstancePath: upstreamPath,
        upstreamContextPaths: contexts
          .map(asRecord)
          .filter((context) => context?.["@_DEST"] === "SW-COMPONENT-PROTOTYPE")
          .map(getXmlText)
          .filter((value): value is string => Boolean(value))
      });
      return;
    }

    if (
      flatTarget?.["@_DEST"] === "P-PORT-PROTOTYPE" ||
      flatTarget?.["@_DEST"] === "R-PORT-PROTOTYPE" ||
      flatTarget?.["@_DEST"] === "PR-PORT-PROTOTYPE"
    ) {
      portMappings.push({ flatPortPath: flatPath, upstreamPortPath: upstreamPath });
    }
  });

  return { instanceMappings, portMappings };
}

function visitDescriptors(value: unknown, visit: (descriptor: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((entry) => visitDescriptors(entry, visit));
    return;
  }
  const record = asRecord(value);
  if (!record) {
    return;
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === "FLAT-INSTANCE-DESCRIPTOR") {
      asArray(child).forEach((entry) => {
        const descriptor = asRecord(entry);
        if (descriptor) {
          visit(descriptor);
        }
      });
    } else {
      visitDescriptors(child, visit);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getXmlText(value: Record<string, unknown> | undefined): string | undefined {
  const text = value?.["#text"];
  return typeof text === "string" ? text : undefined;
}

function samePath(left: string, right: string) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
}
