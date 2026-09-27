import type {
  AutosarEntity,
  CommunicationSpecDetail,
  EntityReferenceInstance,
  InterfaceDetailMember
} from "../../../../../src/shared/contracts";

/** Port ComSpecs are port-owned; the interface view only summarizes their usages. */
export function buildMemberComSpecDescriptions(
  members: InterfaceDetailMember[],
  referenceInstances: EntityReferenceInstance[],
  entities: AutosarEntity[]
): Record<string, string[]> {
  const descriptions: Record<string, string[]> = {};
  const portsById = new Map(entities.filter((entity) => entity.type === "port").map((port) => [port.id, port]));

  for (const instance of referenceInstances) {
    const port = instance.portId ? portsById.get(instance.portId) : undefined;
    if (!port) {
      continue;
    }
    for (const spec of port.details?.communicationSpecs ?? []) {
      const member = members.find((candidate) => isSpecForMember(spec, candidate));
      if (!member) {
        continue;
      }
      const key = member.semanticPath ?? member.label;
      const label = `${formatDirection(spec.comSpecDirection)} ComSpec · ${port.shortName}`;
      const existing = descriptions[key] ?? [];
      if (!existing.includes(label)) {
        descriptions[key] = [...existing, label];
      }
    }
  }

  return descriptions;
}

function isSpecForMember(spec: CommunicationSpecDetail, member: InterfaceDetailMember) {
  if (!spec.dataElement || spec.dataElement === "-") {
    return false;
  }
  if (spec.dataElement.startsWith("/")) {
    return spec.dataElement === member.semanticPath;
  }
  return spec.dataElement === member.label ||
    spec.dataElement.split("/").filter(Boolean).at(-1) === member.label;
}

function formatDirection(direction: string) {
  if (direction === "nvData") {
    return "Nv Data";
  }
  if (!direction || direction === "unknown") {
    return "Generic";
  }
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}
