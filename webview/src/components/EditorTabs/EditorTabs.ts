import type { AutosarEntity, ModelWorkspaceTab, SwcGraphScope } from "../../../../src/shared/contracts";

export type { ModelWorkspaceTab } from "../../../../src/shared/contracts";

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
