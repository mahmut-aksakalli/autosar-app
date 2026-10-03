import type { AutosarEntity, ModelWorkspaceTab, SwcGraphScope } from "../../../../../src/shared/contracts";
import type { DetailBreadcrumb } from "../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";
import { makeModelTab } from "../../EditorTabs/EditorTabs";

/** Build the visible tree path and the actions that return to its ancestors. */
export function buildDetailsBreadcrumbs(
  entity: AutosarEntity | undefined,
  tab: ModelWorkspaceTab | undefined,
  onOpenWorkspaceTab: ((tab: ModelWorkspaceTab) => void) | undefined,
  onRevealModelNode: ((entityId: string, treeNodeId?: string) => void) | undefined
): DetailBreadcrumb[] {
  if (!entity || !tab) {
    return [];
  }

  if (tab.kind === "entityDetails") {
    const category = getEntityTreeCategory(entity.type);
    if (!category) {
      return [{ label: entity.shortName }];
    }
    return [
      {
        label: category.label,
        onClick: onRevealModelNode ? () => onRevealModelNode(entity.id, category.treeNodeId) : undefined
      },
      { label: entity.shortName }
    ];
  }

  const section = getDetailsTreeSection(tab.kind);
  if (!section) {
    return [{ label: tab.title }];
  }

  const scope: SwcGraphScope = entity.type === "composition" ? "composition" : "swc";
  const contextOptions: Partial<ModelWorkspaceTab> = {
    preferredScope: scope,
    compositionContextPaths: tab.compositionContextPaths,
    compositionTreeOrigin: tab.compositionTreeOrigin
  };
  const ownerTreeNodeId = entity.type === "swc" ? `software-component:${entity.id}` : entity.id;
  const isSectionPage = tab.kind === section.kind;
  const itemLabel = tab.title.replace(/^[^:]+:\s*/, "");

  return [
    {
      label: entity.shortName,
      onClick: onOpenWorkspaceTab ? () => {
        onOpenWorkspaceTab(makeModelTab(entity, "graph", "Graph", contextOptions));
        onRevealModelNode?.(entity.id, ownerTreeNodeId);
      } : undefined
    },
    {
      label: section.label,
      onClick: !isSectionPage && onOpenWorkspaceTab ? () => {
        onOpenWorkspaceTab(makeModelTab(entity, section.kind, section.label, contextOptions));
        onRevealModelNode?.(entity.id, `${entity.id}:${section.kind}`);
      } : undefined
    },
    ...(isSectionPage ? [] : [{ label: itemLabel }])
  ];
}

function getDetailsTreeSection(kind: ModelWorkspaceTab["kind"]): {
  kind: ModelWorkspaceTab["kind"];
  label: string;
} | undefined {
  switch (kind) {
    case "ports": return { kind: "ports", label: "Ports" };
    case "runnables": return { kind: "runnables", label: "Runnables" };
    case "parameters": return { kind: "parameters", label: "Calibration Parameters" };
    case "interRunnableVariables": return { kind: "interRunnableVariables", label: "Inter-Runnable Variables" };
    case "perInstanceMemory": return { kind: "perInstanceMemory", label: "Per-Instance Memory" };
    case "serviceDependencies": return { kind: "serviceDependencies", label: "Service Needs" };
    case "port": return { kind: "ports", label: "Ports" };
    case "runnable": return { kind: "runnables", label: "Runnables" };
    case "parameter": return { kind: "parameters", label: "Calibration Parameters" };
    case "interRunnableVariable": return { kind: "interRunnableVariables", label: "Inter-Runnable Variables" };
    case "perInstanceMemoryItem": return { kind: "perInstanceMemory", label: "Per-Instance Memory" };
    case "serviceDependency": return { kind: "serviceDependencies", label: "Service Needs" };
    case "serviceDependencyGroup": return { kind: "serviceDependencies", label: "Service Needs" };
    default: return undefined;
  }
}

function getEntityTreeCategory(type: AutosarEntity["type"]): {
  label: string;
  treeNodeId: string;
} | undefined {
  switch (type) {
    case "interface": return { label: "Port Interfaces", treeNodeId: "port-interfaces" };
    case "application-data-type":
    case "implementation-data-type":
    case "base-type":
    case "unit":
    case "compu-method":
    case "data-constraint":
    case "record-layout":
      return { label: "Data Types", treeNodeId: "data-types" };
    case "constant": return { label: "Constants", treeNodeId: "constants" };
    case "mode-declaration-group": return { label: "Mode Declaration Groups", treeNodeId: "mode-declaration-groups" };
    case "type-mapping-set": return { label: "Type Mapping Sets", treeNodeId: "type-mapping-sets" };
    case "addressing-method": return { label: "Addressing Methods", treeNodeId: "addressing-methods" };
    default: return undefined;
  }
}
