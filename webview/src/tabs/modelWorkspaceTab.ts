import type { AutosarEntity, SwcGraphScope, SwcInspectorSectionId } from "../shared/contracts";

export interface ModelWorkspaceTab {
  id: string;
  title: string;
  pinned?: boolean;
  kind:
    | "graph"
    | "ports"
    | "runnables"
    | "events"
    | "behavior"
    | "memory"
    | "parameters"
    | "interRunnableVariables"
    | "perInstanceMemory"
    | "exclusiveAreas"
    | "serviceDependencies"
    | "serviceDependencyGroup"
    | "port"
    | "parameter"
    | "interRunnableVariable"
    | "perInstanceMemoryItem"
    | "serviceDependency"
    | "runnable"
    | "event"
    | "entityDetails";
  focusEntityId: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  includeCompositionInternals?: boolean;
  entityId?: string;
  sectionId?: SwcInspectorSectionId;
  itemId?: string;
  serviceType?: string;
  xmlPath?: string;
}

export function makeModelTab(
  entity: AutosarEntity,
  kind: ModelWorkspaceTab["kind"],
  titlePrefix: string,
  options: Partial<ModelWorkspaceTab> = {}
): ModelWorkspaceTab {
  return {
    id: `${entity.id}:${kind}:${options.entityId ?? options.itemId ?? options.preferredNodeId ?? "main"}${
      options.includeCompositionInternals ? ":internals" : ""
    }`,
    title: titlePrefix.includes(":") ? titlePrefix : `${titlePrefix}: ${entity.shortName}`,
    pinned: options.pinned,
    kind,
    focusEntityId: entity.id,
    preferredScope: options.preferredScope,
    preferredNodeId: options.preferredNodeId,
    includeCompositionInternals: options.includeCompositionInternals,
    entityId: options.entityId,
    sectionId: options.sectionId,
    itemId: options.itemId,
    serviceType: options.serviceType,
    xmlPath: options.xmlPath
  };
}

export function makeDefaultModelGraphTab(entity: AutosarEntity, preferredScope: SwcGraphScope): ModelWorkspaceTab {
  return makeModelTab(entity, "graph", "Graph", { preferredScope });
}
