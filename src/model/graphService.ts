import type {
  AutosarEntity,
  PortConnection,
  SwcGraphEdge,
  SwcGraphNode,
  SwcGraphPort,
  SwcInspectorData,
  SwcGraphQuery,
  SwcGraphResult,
  ValidationIssue
} from "../shared/contracts";
import type { WorkspaceSnapshot } from "../shared/contracts";
import { enrichPortCommunicationSpecsFromEntities, enrichPortInterfaceMetadataFromEntities } from "./autosarModel";
import { buildNestedServiceConnections, buildRootServiceExternalConnections, getCompositionOccurrenceName, getRootServiceInstances } from "./vectorEcuModelService";

export interface WorkspaceSnapshotProvider {
  getSnapshot(): WorkspaceSnapshot | null;
}

export class GraphService {
  constructor(private readonly workspaceService: WorkspaceSnapshotProvider) {}

  async buildGraph(query: SwcGraphQuery): Promise<SwcGraphResult> {
    const workspace = this.workspaceService.getSnapshot();
    if (!workspace) {
      return { scope: query.scope, focusId: query.focusId, nodes: [], edges: [], warnings: [] };
    }

    const entities = workspace.entities;
    enrichPortInterfaceMetadataFromEntities(entities);
    enrichPortCommunicationSpecsFromEntities(entities);
    const connections = workspace.connections;
    const entityBySemanticPath = new Map(
      entities
        .filter((entity) => entity.semanticPath)
        .map((entity) => [entity.semanticPath!, entity])
    );
    const focus = findFocusEntity(entities, query);
    if (!focus) {
      return {
        scope: query.scope,
        focusId: query.focusId,
        nodes: [],
        edges: [],
        warnings: [
          {
            severity: "warning",
            message: query.focusId
              ? `Could not resolve graph focus ${query.focusId}.`
              : `No ${query.scope} entity is available for visualization.`
          }
        ]
      };
    }

    if (query.scope === "swc") {
      return {
        scope: query.scope,
        focusId: focus.semanticPath ?? focus.id,
        nodes: [toComponentNode(focus, collectPortsForOwner(entities, focus.semanticPath))],
        edges: [],
        warnings: []
      };
    }

    return buildCompositionGraph(
      focus,
      workspace,
      entityBySemanticPath,
      query.includeCompositionInternals === true,
      query.compositionContextPaths
    );
  }
}

function buildCompositionGraph(
  focus: AutosarEntity,
  workspace: WorkspaceSnapshot,
  entityBySemanticPath: Map<string, AutosarEntity>,
  includeInternals: boolean,
  compositionContextPaths: string[] | undefined
): SwcGraphResult {
  const entities = workspace.entities;
  const connections = workspace.connections;
  const warnings: ValidationIssue[] = [];
  const nodes = new Map<string, SwcGraphNode>();
  const edges: SwcGraphEdge[] = [];

  const focusSemanticPath = focus.semanticPath;
  const outerPorts = collectPortsForOwner(entities, focusSemanticPath);
  const focusNode = toComponentNode(focus, outerPorts);
  if (compositionContextPaths && (
    compositionContextPaths.length > 0 || focus.id === workspace.vectorEcu?.rootCompositionId
  )) {
    focusNode.label = getCompositionOccurrenceName(workspace, focus.shortName, compositionContextPaths);
    focusNode.metadata = { ...(focusNode.metadata ?? {}), TYPE: focus.shortName };
  }
  nodes.set(focus.id, focusNode);

  if (!includeInternals) {
    return {
      scope: "composition",
      focusId: focus.semanticPath ?? focus.id,
      nodes: Array.from(nodes.values()),
      edges,
      warnings
    };
  }

  const authoredInstances = entities.filter(
    (entity) => entity.type === "instance" && entity.parentSemanticPath === focusSemanticPath
  );
  const serviceInstances = compositionContextPaths && focus.id === workspace.vectorEcu?.rootCompositionId
    ? getRootServiceInstances(workspace)
    : [];
  const instances = [...authoredInstances, ...serviceInstances];

  instances.forEach((instance) => {
    const typeEntity = instance.typeRef ? entityBySemanticPath.get(instance.typeRef) : undefined;
    const instancePorts = collectPortsForOwner(entities, typeEntity?.semanticPath).map((port) =>
      convertPortOwner(port, instance)
    );

    nodes.set(
      instance.id,
      {
        id: instance.id,
        kind: "instance",
        label: instance.shortName,
        semanticPath: instance.semanticPath,
        xmlPath: instance.xmlPath,
        filePath: instance.filePath,
        parentId: focus.id,
        swcKind: typeEntity?.swcKind,
        typeRef: instance.typeRef,
        metadata: {
          ...(instance.metadata ?? {}),
          ...(typeEntity?.shortName ? { "TYPE": typeEntity.shortName } : {})
        },
        inspector: toInstanceInspector(instance, typeEntity),
        warning: typeEntity ? undefined : "Referenced SWC type could not be resolved.",
        ports: instancePorts
      }
    );

    if (!typeEntity) {
      warnings.push({
        severity: "warning",
        message: `Could not resolve component type for instance ${instance.shortName}.`,
        path: instance.xmlPath
      });
    }
  });

  const relevantConnections = connections.filter((connection) =>
    isConnectionInComposition(connection, focusSemanticPath)
  );

  relevantConnections.forEach((connection) => {
    const edge = toGraphEdge(connection, nodes, outerPorts, warnings, focus.id);
    if (edge) {
      edges.push(edge);
    }
  });

  if (serviceInstances.length > 0) {
    addRootServiceConnections(workspace, nodes, outerPorts, warnings, edges, focus.id);
  }

  const externalConnections = compositionContextPaths && compositionContextPaths.length > 0
    ? buildNestedServiceConnections(workspace, nodes, compositionContextPaths)
    : [];
  if (serviceInstances.length > 0) {
    externalConnections.push(...buildRootServiceExternalConnections(workspace, nodes));
  }

  return {
    scope: "composition",
    focusId: focus.semanticPath ?? focus.id,
    nodes: Array.from(nodes.values()),
    edges,
    warnings,
    externalConnections
  };
}

function addRootServiceConnections(
  workspace: WorkspaceSnapshot,
  nodes: Map<string, SwcGraphNode>,
  outerPorts: SwcGraphPort[],
  warnings: ValidationIssue[],
  edges: SwcGraphEdge[],
  focusNodeId: string
) {
  const model = workspace.vectorEcu;
  if (!model) {
    return;
  }
  const servicePaths = new Set(getRootServiceInstances(workspace).map((instance) => instance.semanticPath));
  const visibleInstancePaths = new Set(
    Array.from(nodes.values())
      .filter((node) => node.kind === "instance")
      .map((node) => node.semanticPath)
  );
  const directInstanceByFlatPath = new Map<string, string>();
  for (const mapping of model.instanceMappings) {
    // Nested leaves belong to their own composition view; this view contains
    // only the root composition's direct children.
    if (mapping.upstreamContextPaths.length !== 0) {
      continue;
    }
    if (visibleInstancePaths.has(mapping.upstreamInstancePath)) {
      directInstanceByFlatPath.set(mapping.flatInstancePath, mapping.upstreamInstancePath);
    }
  }
  for (const servicePath of servicePaths) {
    if (servicePath) {
      directInstanceByFlatPath.set(servicePath, servicePath);
    }
  }

  for (const connection of model.flatConnections) {
    if (connection.kind !== "assembly") {
      continue;
    }
    const providerPath = connection.providerComponentRef;
    const requesterPath = connection.requesterComponentRef;
    if (!servicePaths.has(providerPath) && !servicePaths.has(requesterPath)) {
      continue;
    }
    const provider = providerPath ? directInstanceByFlatPath.get(providerPath) : undefined;
    const requester = requesterPath ? directInstanceByFlatPath.get(requesterPath) : undefined;
    if (!provider || !requester) {
      continue;
    }
    // Reuse the normal graph edge and port-handle resolution after translating
    // flat instance paths to the visible prototype paths.
    const edge: SwcGraphEdge | undefined = toGraphEdge(
      { ...connection, providerComponentRef: provider, requesterComponentRef: requester },
      nodes,
      outerPorts,
      warnings,
      focusNodeId
    );
    if (edge) {
      edge.connectionCategory = "service";
      edges.push(edge);
    }
  }
}

function findFocusEntity(entities: AutosarEntity[], query: SwcGraphQuery) {
  const allowedTypes = query.scope === "composition" ? ["composition"] : ["swc", "composition"];
  const scopedEntities = entities.filter((entity) => allowedTypes.includes(entity.type));

  if (query.focusId) {
    return scopedEntities.find(
      (entity) =>
        entity.id === query.focusId ||
        entity.semanticPath === query.focusId ||
        entity.shortName === query.focusId
    );
  }

  return scopedEntities[0];
}

function collectPortsForOwner(entities: AutosarEntity[], ownerSemanticPath: string | undefined) {
  const entityBySemanticPath = new Map(
    entities
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath!, entity])
  );

  return entities
    .filter((entity) => entity.type === "port" && entity.parentSemanticPath === ownerSemanticPath)
    .map((entity) => toGraphPort(entity, entityBySemanticPath))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function toComponentNode(entity: AutosarEntity, ports: SwcGraphPort[]): SwcGraphNode {
  return {
    id: entity.id,
    kind: entity.type === "composition" ? "composition" : "swc",
    label: entity.shortName,
    semanticPath: entity.semanticPath,
    xmlPath: entity.xmlPath,
    filePath: entity.filePath,
    swcKind: entity.swcKind,
    metadata: entity.metadata,
    inspector: entity.inspector,
    ports
  };
}

function toGraphPort(
  entity: AutosarEntity,
  entityBySemanticPath: Map<string, AutosarEntity>
): SwcGraphPort {
  const interfaceEntity = entity.typeRef ? entityBySemanticPath.get(entity.typeRef) : undefined;

  return {
    id: entity.id,
    label: entity.shortName,
    semanticPath: entity.semanticPath,
    xmlPath: entity.xmlPath,
    direction: entity.portDirection ?? "required",
    portKind: entity.portKind,
    interfaceRef: entity.typeRef,
    interfaceKind:
      interfaceEntity?.interfaceKind && interfaceEntity.interfaceKind !== "unknown"
        ? interfaceEntity.interfaceKind
        : entity.interfaceKind,
    ownerId: entity.parentSemanticPath ?? entity.id,
    ownerSemanticPath: entity.parentSemanticPath,
    filePath: entity.filePath,
    metadata: entity.metadata,
    details: entity.details,
    warning:
      entity.mayBeUnconnected
        ? "Port may be intentionally left unconnected."
        : interfaceEntity
          ? undefined
          : entity.typeRef
            ? "Referenced PortInterface could not be resolved."
            : "Port does not reference a PortInterface."
  };
}

function convertPortOwner(port: SwcGraphPort, instance: AutosarEntity): SwcGraphPort {
  return {
    ...port,
    ownerId: instance.id,
    ownerSemanticPath: instance.semanticPath
  };
}

function toInstanceInspector(
  instance: AutosarEntity,
  typeEntity: AutosarEntity | undefined
): SwcInspectorData | undefined {
  if (!typeEntity?.inspector) {
    return undefined;
  }

  return {
    ...typeEntity.inspector,
    ownerId: instance.id,
    ownerLabel: `${instance.shortName} (${typeEntity.shortName})`
  };
}

function isConnectionInComposition(connection: PortConnection, focusSemanticPath: string | undefined) {
  if (!focusSemanticPath) {
    return false;
  }

  return [
    connection.providerComponentRef,
    connection.requesterComponentRef,
    connection.outerPortRef
  ].some((ref) => ref?.startsWith(`${focusSemanticPath}/`) || ref === focusSemanticPath);
}

function toGraphEdge(
  connection: PortConnection,
  nodes: Map<string, SwcGraphNode>,
  outerPorts: SwcGraphPort[],
  warnings: ValidationIssue[],
  focusNodeId?: string
) {
  if (connection.kind === "assembly") {
    const sourceNode = findInstanceNodeByRef(nodes, connection.providerComponentRef);
    const targetNode = findInstanceNodeByRef(nodes, connection.requesterComponentRef);

    if (!sourceNode || !targetNode) {
      warnings.push({
        severity: "warning",
        message: `Connector ${connection.label} could not resolve both component endpoints.`,
        path: connection.xmlPath
      });
      return undefined;
    }

    const sourceHandle = findNodePortHandle(sourceNode, connection.sourcePortRef);
    const targetHandle = findNodePortHandle(targetNode, connection.targetPortRef);

    return {
      id: connection.id,
      kind: "assembly" as const,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle,
      targetHandle,
      label: connection.label,
      filePath: connection.filePath,
      xmlPath: connection.xmlPath,
      warning:
        sourceHandle && targetHandle ? undefined : "One or more connector ports could not be resolved."
    };
  }

  const sourceNode = findInstanceNodeByRef(nodes, connection.providerComponentRef);
  const outerPort = outerPorts.find((port) => port.semanticPath === connection.outerPortRef);
  const targetNodeId = outerPort ? focusNodeId : undefined;

  if (!sourceNode || !outerPort || !targetNodeId) {
    warnings.push({
      severity: "warning",
      message: `Delegation connector ${connection.label} could not resolve both endpoints.`,
      path: connection.xmlPath
    });
    return undefined;
  }

  return {
    id: connection.id,
    kind: "delegation" as const,
    source: sourceNode.id,
    target: targetNodeId,
    sourceHandle: findNodePortHandle(sourceNode, connection.sourcePortRef),
    targetHandle: outerPort.id,
    label: connection.label,
    filePath: connection.filePath,
    xmlPath: connection.xmlPath,
    warning: connection.unresolved ? "Delegation connector has unresolved port references." : undefined
  };
}

function findInstanceNodeByRef(nodes: Map<string, SwcGraphNode>, semanticPath: string | undefined) {
  if (!semanticPath) {
    return undefined;
  }
  return Array.from(nodes.values()).find((node) => node.kind === "instance" && node.semanticPath === semanticPath);
}

function findNodePortHandle(node: SwcGraphNode, semanticPath: string | undefined) {
  return node.ports.find((port) => port.semanticPath === semanticPath)?.id;
}
