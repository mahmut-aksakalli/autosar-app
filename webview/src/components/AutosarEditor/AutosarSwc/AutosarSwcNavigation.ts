import type { AutosarEntity, SwcGraphNode } from "../../../../../src/shared/contracts";
import type { PortConnectionLabel } from "./AutosarSwcLayout";

export interface DelegationNavigationTarget {
  entityId: string;
  preferredScope: "composition";
  preferredNodeId: string;
  preferredPortId: string;
  compositionContextPaths?: string[];
  compositionTreeOrigin?: "template" | "root";
  treeNodeId: string;
}

/** Resolve the outer port in the parent graph without conflating types and occurrences. */
export function getDelegationNavigationTarget(
  focusEntity: AutosarEntity | undefined,
  entities: AutosarEntity[],
  contextPaths: string[] | undefined,
  connection: PortConnectionLabel,
  treeOrigin: "template" | "root" = "root",
  rootCompositionId?: string
): DelegationNavigationTarget | undefined {
  if (connection.category !== "delegation" || focusEntity?.type !== "composition") {
    return undefined;
  }

  if (contextPaths && contextPaths.length > 0) {
    const currentInstancePath = contextPaths.at(-1);
    const currentInstance = entities.find((entity) => {
      return entity.type === "instance" && entity.semanticPath === currentInstancePath;
    });
    const parentComposition = entities.find((entity) => {
      return entity.type === "composition" && entity.semanticPath === currentInstance?.parentSemanticPath;
    });
    if (!currentInstance || !parentComposition) {
      return undefined;
    }

    const parentContextPaths = contextPaths.slice(0, -1);
    const parentTreeOrigin = parentComposition.id === rootCompositionId ? "root" : treeOrigin;
    const parentTreeNodeId = parentTreeOrigin === "template"
      ? `${parentComposition.id}:template:${parentContextPaths.length > 0 ? `${parentContextPaths.join(":")}:` : ""}${currentInstance.id}`
      : `${parentComposition.id}:${parentContextPaths.join(":")}:${currentInstance.id}`;
    return {
      entityId: parentComposition.id,
      preferredScope: "composition",
      preferredNodeId: currentInstance.id,
      preferredPortId: connection.targetPortId,
      compositionContextPaths: parentTreeOrigin === "template" && parentContextPaths.length === 0
        ? undefined
        : parentContextPaths,
      compositionTreeOrigin: parentTreeOrigin,
      treeNodeId: parentTreeNodeId
    };
  }

  // With no context this is a type template. An empty context is the concrete
  // ECU root, whose outer port has no parent composition to navigate to.
  return {
    entityId: focusEntity.id,
    preferredScope: "composition",
    preferredNodeId: focusEntity.id,
    preferredPortId: connection.targetPortId,
    compositionContextPaths: contextPaths,
    compositionTreeOrigin: contextPaths ? treeOrigin : "template",
    treeNodeId: focusEntity.id
  };
}

/** Locate the explorer entry for a node selected from the current graph. */
export function getConnectionTreeNodeId(
  focusEntity: AutosarEntity | undefined,
  targetNode: SwcGraphNode | undefined,
  entities: AutosarEntity[],
  contextPaths: string[] | undefined,
  treeOrigin: "template" | "root"
): string | undefined {
  if (!focusEntity || !targetNode) {
    return undefined;
  }
  if (targetNode.kind === "composition") {
    return targetNode.id;
  }
  if (targetNode.kind === "swc") {
    return `software-component:${targetNode.id}`;
  }
  if (targetNode.kind !== "instance" || focusEntity.type !== "composition") {
    return undefined;
  }

  // FlatExtract-only service instances are virtual root children, not
  // canonical instance entities from the authored composition hierarchy.
  const isVirtualService = !entities.some((entity) => entity.id === targetNode.id && entity.type === "instance");
  if (isVirtualService) {
    return `${focusEntity.id}:service:${targetNode.id}`;
  }

  const contextKey = contextPaths?.join(":") ?? "template";
  if (treeOrigin === "template" && contextPaths) {
    return `${focusEntity.id}:template:${contextKey}:${targetNode.id}`;
  }
  return `${focusEntity.id}:${contextKey}:${targetNode.id}`;
}
