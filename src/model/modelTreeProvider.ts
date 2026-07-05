import * as vscode from "vscode";
import type {
  AutosarEntity,
  SwcGraphScope,
  SwcInspectorItem,
  SwcInspectorSectionId,
  WorkspaceSnapshot
} from "../shared/contracts";

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
    | "event";
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

export interface ModelTreeNode {
  id: string;
  label: string;
  icon?: string;
  focusEntityId?: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  workspaceTab?: ModelWorkspaceTab;
  selectable?: boolean;
  children?: ModelTreeNode[];
}

export class ModelTreeProvider implements vscode.TreeDataProvider<ModelTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<ModelTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private snapshot: WorkspaceSnapshot | null = null;

  update(snapshot: WorkspaceSnapshot | null) {
    this.snapshot = snapshot;
    this.changeEmitter.fire();
  }

  getTreeItem(node: ModelTreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, getCollapsibleState(node));
    item.contextValue = node.selectable ? `autosarModelNode.${node.workspaceTab?.kind ?? "entity"}` : "autosarModelGroup";
    item.iconPath = getNodeIconPath(node);
    item.tooltip = getTreeTooltip(node);
    if (node.selectable) {
      item.command = {
        command: "autosarModelView.selectTreeNode",
        title: "Open AUTOSAR Model Node",
        arguments: [node]
      };
    }
    return item;
  }

  getChildren(node?: ModelTreeNode): ModelTreeNode[] {
    if (node) {
      return node.children ?? [];
    }

    if (!this.snapshot) {
      return [];
    }

    return buildModelTree(this.snapshot);
  }
}

function buildModelTree(workspace: WorkspaceSnapshot | null): ModelTreeNode[] {
  if (!workspace) {
    return [];
  }

  const entities = workspace.entities;
  const compositions = entities
    .filter((entity) => entity.type === "composition")
    .slice()
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
  const swcs = entities
    .filter((entity) => entity.type === "swc")
    .slice()
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
  const portsByOwner = new Map<string, AutosarEntity[]>();

  entities
    .filter((entity) => entity.type === "port" && entity.parentSemanticPath)
    .forEach((port) => {
      const ports = portsByOwner.get(port.parentSemanticPath!) ?? [];
      ports.push(port);
      portsByOwner.set(port.parentSemanticPath!, ports);
    });

  const compositionTree: ModelTreeNode[] = compositions.map((composition) => {
    const children = entities
      .filter(
        (entity) =>
          entity.type === "instance" &&
          entity.parentSemanticPath &&
          composition.semanticPath &&
          entity.parentSemanticPath === composition.semanticPath
      )
      .map((instance): ModelTreeNode => ({
        id: `${composition.id}:${instance.id}`,
        label: instance.shortName,
        icon: "I",
        focusEntityId: composition.id,
        preferredScope: "composition",
        preferredNodeId: instance.id,
        selectable: true,
        workspaceTab: makeModelTab(composition, "graph", `Graph: ${instance.shortName}`, {
          preferredScope: "composition",
          preferredNodeId: instance.id
        })
      }))
      .sort((left, right) => left.label.localeCompare(right.label));

    return {
      id: composition.id,
      label: composition.shortName,
      icon: "C",
      focusEntityId: composition.id,
      preferredScope: "composition",
      workspaceTab: makeModelTab(composition, "graph", "Graph", {
        preferredScope: "composition"
      }),
      selectable: true,
      children
    };
  });

  const componentChildren = swcs.map((swc): ModelTreeNode => ({
    id: `software-component:${swc.id}`,
    label: swc.shortName,
    icon: formatSwcKindIcon(swc.swcKind),
    focusEntityId: swc.id,
    preferredScope: "swc",
    selectable: true,
    workspaceTab: makeModelTab(swc, "graph", "Graph", {
      preferredScope: "swc"
    }),
    children: buildSwcWorkspaceChildren(swc, portsByOwner.get(swc.semanticPath ?? "") ?? [])
  }));
  const componentFamilies = new Map<string, ModelTreeNode[]>();

  componentChildren.forEach((child) => {
    const swc = swcs.find((entity) => `software-component:${entity.id}` === child.id);
    const familyLabel = formatSwcKindLabel(swc?.swcKind);
    const familyChildren = componentFamilies.get(familyLabel) ?? [];
    familyChildren.push(child);
    componentFamilies.set(familyLabel, familyChildren);
  });

  return [
    {
      id: "software-compositions",
      label: "SOFTWARE COMPOSITIONS",
      selectable: false,
      children: compositionTree
    },
    {
      id: "software-components",
      label: "SOFTWARE COMPONENTS",
      selectable: false,
      children: Array.from(componentFamilies.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, children]) => ({
          id: `software-components:${label}`,
          label,
          icon: "folder",
          selectable: false,
          children
        }))
    }
  ];
}

function buildSwcWorkspaceChildren(swc: AutosarEntity, ports: AutosarEntity[]): ModelTreeNode[] {
  const inspector = swc.inspector;
  const runnables = inspector?.sections.find((section) => section.id === "runnables")?.items ?? [];
  const interRunnableVariables =
    inspector?.sections.find((section) => section.id === "interRunnableVariables")?.items ?? [];
  const perInstanceMemory = inspector?.sections.find((section) => section.id === "perInstanceMemory")?.items ?? [];
  const serviceDependencies = inspector?.sections.find((section) => section.id === "serviceDependencies")?.items ?? [];
  const parameters = getInspectorItems(inspector, ["calibrationVariables", "interfaceParameters"]);

  return [
    makeSwcWorkspaceNode(swc, "graph", "Graph"),
    {
      ...makeSwcWorkspaceNode(swc, "runnables", "Runnables"),
      children: runnables.map((runnable) => ({
        id: `${swc.id}:runnable:${runnable.id}`,
        label: runnable.label,
        icon: "R",
        focusEntityId: swc.id,
        preferredScope: "swc" as const,
        selectable: true,
        workspaceTab: makeModelTab(swc, "runnable", `Runnable: ${runnable.label}`, {
          sectionId: "runnables",
          itemId: runnable.id,
          xmlPath: runnable.xmlPath
        })
      }))
    },
    {
      ...makeSwcWorkspaceNode(swc, "ports", "Ports"),
      children: ports
        .slice()
        .sort((left, right) => left.shortName.localeCompare(right.shortName))
        .map((port) => ({
          id: `${swc.id}:port:${port.id}`,
          label: port.shortName,
          icon: formatPortIcon(port),
          focusEntityId: swc.id,
          preferredScope: "swc" as const,
          selectable: true,
          workspaceTab: makeModelTab(swc, "port", `Port: ${port.shortName}`, {
            entityId: port.id,
            xmlPath: port.xmlPath
          })
        }))
    },
    {
      ...makeSwcWorkspaceNode(swc, "interRunnableVariables", "Inter-Runnable Variables", interRunnableVariables.length),
      children: interRunnableVariables
        .slice()
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((item) =>
          makeInspectorItemNode(
            swc,
            item,
            "interRunnableVariables",
            "interRunnableVariable",
            "V",
            "Inter-Runnable Variable"
          )
        )
    },
    {
      ...makeSwcWorkspaceNode(swc, "parameters", "Calibration Parameters", parameters.length),
      children: parameters
        .slice()
        .sort((left, right) => left.item.label.localeCompare(right.item.label))
        .map(({ item, sectionId }) => makeInspectorItemNode(swc, item, sectionId, "parameter", "K", "Parameter"))
    },
    {
      ...makeSwcWorkspaceNode(swc, "perInstanceMemory", "Per-Instance Memory", perInstanceMemory.length),
      children: perInstanceMemory
        .slice()
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((item) =>
          makeInspectorItemNode(swc, item, "perInstanceMemory", "perInstanceMemoryItem", "M", "Per-Instance Memory")
        )
    },
    makeServiceNeedsWorkspaceNode(swc, serviceDependencies)
  ];
}

function makeServiceNeedsWorkspaceNode(swc: AutosarEntity, serviceDependencies: SwcInspectorItem[]): ModelTreeNode {
  const groups = groupServiceDependenciesByType(serviceDependencies);
  return {
    id: `${swc.id}:serviceDependencies`,
    label: `Service Needs (${serviceDependencies.length})`,
    icon: formatModelWorkspaceIcon("serviceDependencies"),
    focusEntityId: swc.id,
    preferredScope: "swc",
    selectable: false,
    children: groups.map(([serviceType, items]) => ({
      id: `${swc.id}:serviceDependencies:${serviceType}`,
      label: `${serviceType} (${items.length})`,
      icon: "S",
      focusEntityId: swc.id,
      preferredScope: "swc",
      selectable: true,
      workspaceTab: makeModelTab(swc, "serviceDependencyGroup", `Service Needs: ${serviceType}`, {
        preferredScope: "swc",
        serviceType
      }),
      children: items
        .slice()
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((item) =>
          makeInspectorItemNode(swc, item, "serviceDependencies", "serviceDependency", "S", "Service Need")
        )
    }))
  };
}

function groupServiceDependenciesByType(serviceDependencies: SwcInspectorItem[]) {
  const groups = new Map<string, SwcInspectorItem[]>();
  for (const item of serviceDependencies) {
    const serviceType = item.metadata?.["SERVICE-TYPE"] ?? "SERVICE-NEEDS";
    const items = groups.get(serviceType) ?? [];
    items.push(item);
    groups.set(serviceType, items);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function getInspectorItems(
  inspector: AutosarEntity["inspector"],
  sectionIds: SwcInspectorSectionId[]
): Array<{ sectionId: SwcInspectorSectionId; item: SwcInspectorItem }> {
  return sectionIds.flatMap((sectionId) => {
    const section = inspector?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({ sectionId, item }));
  });
}

function makeInspectorItemNode(
  swc: AutosarEntity,
  item: SwcInspectorItem,
  sectionId: SwcInspectorSectionId,
  kind: ModelWorkspaceTab["kind"],
  icon: string,
  titlePrefix: string
): ModelTreeNode {
  return {
    id: `${swc.id}:${sectionId}:${item.id}`,
    label: item.label,
    icon,
    focusEntityId: swc.id,
    preferredScope: "swc",
    selectable: true,
    workspaceTab: makeModelTab(swc, kind, `${titlePrefix}: ${item.label}`, {
      sectionId,
      itemId: item.id,
      xmlPath: item.xmlPath
    })
  };
}

function makeSwcWorkspaceNode(
  swc: AutosarEntity,
  kind: ModelWorkspaceTab["kind"],
  label: string,
  count?: number
): ModelTreeNode {
  return {
    id: `${swc.id}:${kind}`,
    label: count !== undefined ? `${label} (${count})` : label,
    icon: formatModelWorkspaceIcon(kind),
    focusEntityId: swc.id,
    preferredScope: "swc",
    selectable: true,
    workspaceTab: makeModelTab(swc, kind, label, {
      preferredScope: "swc"
    })
  };
}

function makeModelTab(
  entity: AutosarEntity,
  kind: ModelWorkspaceTab["kind"],
  titlePrefix: string,
  options: Partial<ModelWorkspaceTab> = {}
): ModelWorkspaceTab {
  return {
    id: `${entity.id}:${kind}:${
      options.entityId ?? options.itemId ?? options.preferredNodeId ?? options.serviceType ?? "main"
    }${
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

function getCollapsibleState(node: ModelTreeNode) {
  if (!node.children?.length) {
    return vscode.TreeItemCollapsibleState.None;
  }

  if (node.id === "software-compositions" || node.id === "software-components") {
    return vscode.TreeItemCollapsibleState.Expanded;
  }

  return vscode.TreeItemCollapsibleState.Collapsed;
}

function getNodeIconPath(node: ModelTreeNode) {
  if (node.id === "software-compositions" || node.id === "software-components") {
    return undefined;
  }
  if (node.id.startsWith("software-components:")) {
    return makeBadgeIcon("folder");
  }
  return node.icon ? makeBadgeIcon(node.icon) : undefined;
}

function getTreeTooltip(node: ModelTreeNode) {
  const parts = [
    node.workspaceTab?.title,
    node.workspaceTab?.kind ? `Kind: ${node.workspaceTab.kind}` : undefined,
    node.preferredScope ? `Scope: ${node.preferredScope}` : undefined,
    node.preferredNodeId ? `Node: ${node.preferredNodeId}` : undefined
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : node.label;
}

function makeBadgeIcon(label: string) {
  if (label === "folder") {
    return makeFolderIcon();
  }

  const normalizedLabel = label;
  const palette = getBadgePalette(normalizedLabel);
  const width = 16;
  const fontSize = normalizedLabel.length > 1 ? 8 : 9;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="16" viewBox="0 0 16 16">`,
    `<rect x="0.5" y="0.5" width="15" height="15" fill="${palette.background}" stroke="${palette.border}"/>`,
    `<text x="8" y="10.8" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${palette.text}">${escapeSvgText(normalizedLabel)}</text>`,
    `</svg>`
  ].join("");
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

function makeFolderIcon() {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">`,
    `<path d="M2.5 5.5H15V14H1.5V5.5H2.5Z" fill="#f7fbff" stroke="#546f8a" stroke-width="1.5"/>`,
    `<path d="M2.5 2.5H8.5V5.5H1.5V3.5C1.5 2.95 1.95 2.5 2.5 2.5Z" fill="#f7fbff" stroke="#546f8a" stroke-width="1.5"/>`,
    `</svg>`
  ].join("");
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

function getBadgePalette(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === "c") {
    return { border: "#9b6f2d", background: "#fff7e5", text: "#7a5018" };
  }
  if (normalized === "a" || normalized === "w") {
    return { border: "#5f8ab6", background: "#edf6ff", text: "#245b8f" };
  }
  if (normalized === "s" || normalized === "x") {
    return { border: "#7c8d50", background: "#f4fae8", text: "#526529" };
  }
  if (normalized === "t" || normalized === "e" || normalized === "d") {
    return { border: "#8b789d", background: "#f8f2ff", text: "#5c4470" };
  }
  if (normalized === "n" || normalized === "k" || normalized === "m" || normalized === "v") {
    return { border: "#87949f", background: "#f4f7f9", text: "#4f5d69" };
  }
  if (normalized === "r" || normalized === "p" || normalized === "g") {
    return { border: "#62937b", background: "#eef8f3", text: "#2f6d4f" };
  }
  if (normalized === "sr") {
    return { border: "#3f8f73", background: "#eaf8f1", text: "#1f6b4d" };
  }
  if (normalized === "cs") {
    return { border: "#4b7fb7", background: "#edf5ff", text: "#245c96" };
  }
  if (normalized === "pa") {
    return { border: "#8f6fb3", background: "#f6f0ff", text: "#63428e" };
  }
  if (normalized === "nv") {
    return { border: "#c07a3a", background: "#fff3e7", text: "#89501d" };
  }
  if (normalized === "mo") {
    return { border: "#6678c8", background: "#f0f3ff", text: "#3f5098" };
  }
  if (normalized === "tr") {
    return { border: "#b35a78", background: "#fff0f5", text: "#84324f" };
  }
  if (normalized === "po" || normalized === "ro" || normalized === "pr") {
    return { border: "#6f8fa8", background: "#f0f6fa", text: "#3f5f76" };
  }
  return { border: "#9eb0c2", background: "#ffffff", text: "#3e5266" };
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatModelWorkspaceIcon(kind: ModelWorkspaceTab["kind"]) {
  switch (kind) {
    case "graph":
      return "G";
    case "runnables":
    case "runnable":
      return "R";
    case "ports":
    case "port":
      return "P";
    case "interRunnableVariables":
      return "V";
    case "parameters":
      return "K";
    case "perInstanceMemory":
    case "perInstanceMemoryItem":
    case "memory":
      return "M";
    case "serviceDependencies":
    case "serviceDependencyGroup":
    case "serviceDependency":
      return "S";
    case "events":
    case "event":
      return "E";
    case "behavior":
      return "B";
    case "exclusiveAreas":
      return "X";
    default:
      return "D";
  }
}

function formatPortIcon(port: Pick<AutosarEntity, "interfaceKind" | "portDirection">) {
  switch (port.interfaceKind) {
    case "sender-receiver":
      return "SR";
    case "client-server":
      return "CS";
    case "parameter":
      return "Pa";
    case "nv-data":
      return "Nv";
    case "mode-switch":
      return "Mo";
    case "trigger":
      return "Tr";
  }

  switch (port.portDirection) {
    case "provided":
      return "Po";
    case "required":
      return "Ro";
    case "provided-required":
      return "PR";
    default:
      return "P";
  }
}

function formatSwcKindIcon(kind: AutosarEntity["swcKind"]) {
  switch (kind) {
    case "composition":
      return "C";
    case "application":
      return "A";
    case "parameter":
      return "K";
    case "sensor-actuator":
      return "T";
    case "ecu-abstraction":
      return "E";
    case "complex-device-driver":
      return "D";
    case "service":
      return "S";
    case "service-proxy":
      return "X";
    case "nv-block":
      return "N";
    default:
      return "W";
  }
}

function formatSwcKindLabel(kind: AutosarEntity["swcKind"]) {
  switch (kind) {
    case "application":
      return "Application SWCs";
    case "parameter":
      return "Parameter SWCs";
    case "sensor-actuator":
      return "Sensor/Actuator SWCs";
    case "ecu-abstraction":
      return "ECU Abstraction SWCs";
    case "complex-device-driver":
      return "Complex Driver SWCs";
    case "service":
      return "Service SWCs";
    case "service-proxy":
      return "Service Proxy SWCs";
    case "nv-block":
      return "NvBlock SWCs";
    default:
      return "Other SWCs";
  }
}
