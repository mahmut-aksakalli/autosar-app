import type { SwcInstanceReference } from "../../../../../../../src/shared/contracts";

export type InstanceColumnKey = "instanceName" | "parentCompositionName" | "instancePath";
export type SortDirection = "asc" | "desc";

export function filterAndSortInstances(
  instances: SwcInstanceReference[],
  searchQuery: string,
  sort: { key: InstanceColumnKey; direction: SortDirection }
) {
  const normalizedQuery = normalizeText(searchQuery);
  const visibleInstances = instances.filter((instance) => {
    if (!normalizedQuery) {
      return true;
    }

    return [instance.instanceName, instance.parentCompositionName, instance.instancePath ?? ""].some((value) => {
      return normalizeText(value).includes(normalizedQuery);
    });
  });

  return visibleInstances.sort((left, right) => {
    const leftValue = getColumnValue(left, sort.key);
    const rightValue = getColumnValue(right, sort.key);
    const order = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? order : -order;
  });
}

function getColumnValue(instance: SwcInstanceReference, key: InstanceColumnKey) {
  if (key === "instanceName") {
    return instance.instanceName;
  }
  if (key === "parentCompositionName") {
    return instance.parentCompositionName;
  }
  return instance.instancePath ?? "";
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase();
}
