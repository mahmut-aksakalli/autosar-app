import type { AutosarEntity, SwcInstanceReference } from "../shared/contracts";

/** Builds a project-wide index from component types to their composition instances. */
export function buildSwcInstanceReferences(entities: AutosarEntity[]): SwcInstanceReference[] {
  const componentTypesByPath = new Map<string, AutosarEntity>();
  const compositionsByPath = new Map<string, AutosarEntity>();

  for (const entity of entities) {
    if (entity.semanticPath && (entity.type === "swc" || entity.type === "composition")) {
      componentTypesByPath.set(entity.semanticPath, entity);
    }
    if (entity.semanticPath && entity.type === "composition") {
      compositionsByPath.set(entity.semanticPath, entity);
    }
  }

  const references: SwcInstanceReference[] = [];
  for (const instance of entities) {
    if (instance.type !== "instance" || !instance.typeRef || !instance.parentSemanticPath) {
      continue;
    }

    const componentType = componentTypesByPath.get(instance.typeRef);
    const parentComposition = compositionsByPath.get(instance.parentSemanticPath);
    if (!componentType || !parentComposition) {
      continue;
    }

    references.push({
      id: instance.id,
      instanceName: instance.shortName,
      instancePath: instance.semanticPath,
      typeRef: instance.typeRef,
      swcId: componentType.id,
      swcName: componentType.shortName,
      parentCompositionId: parentComposition.id,
      parentCompositionName: parentComposition.shortName,
      parentCompositionPath: parentComposition.semanticPath,
      treeNodeId: `${parentComposition.id}:${instance.id}`
    });
  }

  return references.sort((left, right) => {
    const compositionOrder = left.parentCompositionName.localeCompare(right.parentCompositionName);
    if (compositionOrder !== 0) {
      return compositionOrder;
    }
    return left.instanceName.localeCompare(right.instanceName);
  });
}
