import type { AutosarEntity } from "../shared/contracts";

const SUPPLEMENTAL_TYPES = new Set([
  "application-data-type",
  "implementation-data-type",
  "base-type",
  "compu-method",
  "data-constraint"
]);

/** Bring in referenced platform definitions without merging a second ECU model. */
export function selectReferencedSupplementalTypes(
  canonicalEntities: AutosarEntity[],
  supplementalCandidates: AutosarEntity[]
): AutosarEntity[] {
  const knownPaths = new Set(canonicalEntities.map((entity) => entity.semanticPath).filter(Boolean));
  const candidatesByPath = new Map<string, AutosarEntity>();
  for (const entity of supplementalCandidates) {
    if (entity.semanticPath && SUPPLEMENTAL_TYPES.has(entity.type) && !candidatesByPath.has(entity.semanticPath)) {
      candidatesByPath.set(entity.semanticPath, entity);
    }
  }

  const pendingPaths = canonicalEntities.flatMap((entity) =>
    (entity.references ?? []).map((reference) => reference.target)
  );
  const selected: AutosarEntity[] = [];
  for (let index = 0; index < pendingPaths.length; index += 1) {
    const targetPath = pendingPaths[index];
    if (!targetPath || knownPaths.has(targetPath)) {
      continue;
    }
    const target = candidatesByPath.get(targetPath);
    if (!target) {
      continue;
    }
    knownPaths.add(targetPath);
    selected.push(target);
    pendingPaths.push(...(target.references ?? []).map((reference) => reference.target));
  }
  return selected;
}
