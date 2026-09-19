import type {
  AutosarEntity,
  AutosarEntityReference,
  EntityReferenceInstance
} from "../shared/contracts";

interface ReferenceCandidate {
  target: AutosarEntity;
  source: AutosarEntity;
  reference: AutosarEntityReference;
}

// These references declare that an internal behavior includes definitions for
// generated code. They do not create model instances of those definitions.
const NON_INSTANCE_REFERENCE_ROLES_BY_TARGET_TYPE: Record<string, Set<string>> = {
  "application-data-type": new Set(["DATA-TYPE-REF"]),
  "implementation-data-type": new Set(["DATA-TYPE-REF"]),
  "base-type": new Set(["DATA-TYPE-REF"]),
  "mode-declaration-group": new Set(["MODE-DECLARATION-GROUP-REF"])
};

/** Creates a reverse index from reusable AUTOSAR definitions to their usages. */
export function buildReferenceInstancesByTargetId(
  entities: AutosarEntity[]
): Record<string, EntityReferenceInstance[]> {
  const entitiesBySemanticPath = new Map(
    entities
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath!, entity])
  );
  const candidatesByTargetId = new Map<string, ReferenceCandidate[]>();

  for (const source of entities) {
    for (const reference of source.references ?? []) {
      const target = entitiesBySemanticPath.get(reference.target);
      if (!target || target.id === source.id) {
        continue;
      }
      if (!isInstanceReference(target, reference)) {
        continue;
      }

      const candidates = candidatesByTargetId.get(target.id) ?? [];
      candidates.push({ target, source, reference });
      candidatesByTargetId.set(target.id, candidates);
    }
  }

  const instancesByTargetId: Record<string, EntityReferenceInstance[]> = {};
  for (const [targetId, candidates] of candidatesByTargetId) {
    const closestCandidates = candidates.filter((candidate) => {
      return !candidates.some((other) => isMoreSpecificDuplicate(candidate, other));
    });
    const instances = new Map<string, EntityReferenceInstance>();

    for (const candidate of closestCandidates) {
      const navigationEntity = getNavigationEntity(candidate.source, entitiesBySemanticPath);
      if (!navigationEntity) {
        continue;
      }

      const instancePath =
        candidate.reference.contextPath ??
        candidate.source.semanticPath ??
        candidate.source.xmlPath ??
        candidate.source.path;
      const id = [
        targetId,
        candidate.source.id,
        instancePath,
        candidate.reference.role
      ].join(":");
      instances.set(id, {
        id,
        instanceName: candidate.reference.contextName ?? candidate.source.shortName,
        instanceType: candidate.reference.contextType ?? candidate.source.rawTagName ?? candidate.source.type,
        referenceRole: candidate.reference.role,
        instancePath,
        navigationEntityId: navigationEntity.id,
        navigationSemanticPath: navigationEntity.semanticPath,
        navigationEntityType: navigationEntity.type,
        ...(candidate.source.type === "port"
          ? {
              portId: candidate.source.id,
              ...(candidate.source.xmlPath ? { portXmlPath: candidate.source.xmlPath } : {})
            }
          : {})
      });
    }

    instancesByTargetId[targetId] = Array.from(instances.values()).sort((left, right) => {
      const nameOrder = left.instanceName.localeCompare(right.instanceName);
      if (nameOrder !== 0) {
        return nameOrder;
      }
      return left.instancePath.localeCompare(right.instancePath);
    });
  }

  return instancesByTargetId;
}

function isInstanceReference(
  target: AutosarEntity,
  reference: AutosarEntityReference
) {
  const excludedRoles = NON_INSTANCE_REFERENCE_ROLES_BY_TARGET_TYPE[target.type];
  if (!excludedRoles) {
    return true;
  }
  return !excludedRoles.has(reference.role);
}

function isMoreSpecificDuplicate(candidate: ReferenceCandidate, other: ReferenceCandidate) {
  if (candidate.source.id === other.source.id) {
    return false;
  }
  if (candidate.reference.target !== other.reference.target) {
    return false;
  }
  if (candidate.reference.role !== other.reference.role) {
    return false;
  }
  if (candidate.reference.contextPath !== other.reference.contextPath) {
    return false;
  }

  const candidatePath = candidate.source.semanticPath;
  const otherPath = other.source.semanticPath;
  return Boolean(candidatePath && otherPath?.startsWith(`${candidatePath}/`));
}

function getNavigationEntity(
  source: AutosarEntity,
  entitiesBySemanticPath: Map<string, AutosarEntity>
) {
  if (source.type === "port" && source.parentSemanticPath) {
    return entitiesBySemanticPath.get(source.parentSemanticPath);
  }
  if (source.type === "instance" && source.parentSemanticPath) {
    return entitiesBySemanticPath.get(source.parentSemanticPath);
  }
  return source;
}
