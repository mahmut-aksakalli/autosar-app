import type { SwcInspectorData, SwcInspectorSectionId } from "../../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../../EditorTabs/EditorTabs";
import type { DetailsTableItem } from "./DetailsTable";

export function getSectionsForTab(kind: ModelWorkspaceTab["kind"]): SwcInspectorSectionId[] {
  switch (kind) {
    case "runnables":
      return ["runnables"];
    case "parameters":
      return ["calibrationVariables", "interfaceParameters"];
    case "interRunnableVariables":
      return ["interRunnableVariables"];
    case "perInstanceMemory":
    case "perInstanceMemoryItem":
    case "memory":
      return ["perInstanceMemory"];
    case "events":
    case "event":
      return ["interfaceTriggers", "interfaceModeGroups"];
    case "serviceDependencies":
    case "serviceDependencyGroup":
    case "serviceDependency":
      return ["serviceDependencies"];
    case "exclusiveAreas":
      return [];
    default:
      return [
        "runnables",
        "calibrationVariables",
        "interRunnableVariables",
        "perInstanceMemory",
        "serviceDependencies",
        "interfaceDataElements",
        "interfaceOperations",
        "interfaceApplicationErrors",
        "interfaceParameters",
        "interfaceModeGroups",
        "interfaceTriggers"
      ];
  }
}

export function getDetailsColumns(kind: ModelWorkspaceTab["kind"]) {
  if (kind === "parameters") {
    return [
      { key: "section", label: "Source" },
      { key: "label", label: "Parameter" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" },
      { key: "TYPE", label: "Type" }
    ];
  }

  if (kind === "events" || kind === "event") {
    return [
      { key: "section", label: "Source" },
      { key: "label", label: "Event" },
      { key: "INTERFACE", label: "Interface" },
      { key: "PORT", label: "Port" }
    ];
  }

  if (kind === "serviceDependencies" || kind === "serviceDependencyGroup" || kind === "serviceDependency") {
    return [
      { key: "label", label: "Name" },
      { key: "SERVICE-TYPE", label: "Service Type" },
      { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
    ];
  }

  return [
    { key: "section", label: "Section" },
    { key: "label", label: "Name" },
    { key: "TYPE", label: "Type" },
    { key: "SYMBOL", label: "Symbol" },
    { key: "PERIOD", label: "Period" }
  ];
}

export function getEmptyLabel(kind: ModelWorkspaceTab["kind"]) {
  switch (kind) {
    case "events":
      return "No events discovered.";
    case "parameters":
      return "No parameters discovered.";
    case "perInstanceMemory":
      return "No per-instance memory discovered.";
    case "exclusiveAreas":
      return "No exclusive areas discovered.";
    case "serviceDependencies":
    case "serviceDependencyGroup":
      return "No service needs discovered.";
    default:
      return "No semantic details discovered.";
  }
}

export function findInspectorItem(
  inspector: SwcInspectorData | undefined,
  sectionId: SwcInspectorSectionId,
  itemId: string | undefined
) {
  return inspector?.sections.find((section) => section.id === sectionId)?.items.find((item) => item.id === itemId);
}

export function findInspectorItemInSections(
  inspector: SwcInspectorData | undefined,
  sectionIds: SwcInspectorSectionId[],
  itemId: string | undefined
) {
  if (!itemId) {
    return undefined;
  }

  for (const sectionId of sectionIds) {
    const item = findInspectorItem(inspector, sectionId, itemId);
    if (item) {
      return item;
    }
  }

  return undefined;
}

export function collectInspectorItems(
  inspector: SwcInspectorData | undefined,
  sectionIds: SwcInspectorSectionId[]
): DetailsTableItem[] {
  return sectionIds.flatMap((sectionId) => {
    const section = inspector?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({
      sectionId,
      sectionLabel: section?.label ?? sectionId,
      item
    }));
  });
}
