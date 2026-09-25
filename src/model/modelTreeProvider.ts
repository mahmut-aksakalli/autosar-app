import * as vscode from "vscode";
import type {
  AutosarEntity,
  ModelWorkspaceTab,
  SwcGraphScope,
  SwcInspectorItem,
  SwcInspectorSectionId,
  WorkspaceSnapshot
} from "../shared/contracts";
import { getRootServiceInstances } from "./vectorEcuModelService";

export type { ModelWorkspaceTab } from "../shared/contracts";

export interface ModelTreeNode {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  focusEntityId?: string;
  preferredScope?: SwcGraphScope;
  preferredNodeId?: string;
  compositionContextPaths?: string[];
  workspaceTab?: ModelWorkspaceTab;
  selectable?: boolean;
  forceExpanded?: boolean;
  children?: ModelTreeNode[];
}

export type TreeGroupingMode = "semantic" | "packages";

export class ModelTreeProvider implements vscode.TreeDataProvider<ModelTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<ModelTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private snapshot: WorkspaceSnapshot | null = null;
  private groupingMode: TreeGroupingMode = "semantic";
  private filterText = "";
  private indexing = false;
  private roots: ModelTreeNode[] | undefined;
  private readonly nodesById = new Map<string, ModelTreeNode>();
  private readonly parentsById = new Map<string, ModelTreeNode>();

  private refresh() {
    this.roots = undefined;
    this.nodesById.clear();
    this.parentsById.clear();
    this.changeEmitter.fire();
  }

  update(snapshot: WorkspaceSnapshot | null) {
    this.snapshot = snapshot;
    this.refresh();
  }

  setIndexing(indexing: boolean) {
    this.indexing = indexing;
    this.refresh();
  }

  setGroupingMode(mode: TreeGroupingMode) {
    this.groupingMode = mode;
    this.refresh();
  }

  setFilterText(value: string) {
    this.filterText = value.trim();
    this.refresh();
  }

  getFilterText() {
    return this.filterText;
  }

  getTreeItem(node: ModelTreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, getCollapsibleState(node));
    item.id = node.id;
    item.contextValue = node.selectable ? `autosarModelNode.${node.workspaceTab?.kind ?? "entity"}` : "autosarModelGroup";
    item.iconPath = getNodeIconPath(node);
    item.tooltip = node.tooltip;
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

    if (!this.roots) {
      this.roots = this.buildRoots();
      const indexNodes = (nodes: ModelTreeNode[], parent?: ModelTreeNode) => {
        for (const child of nodes) {
          this.nodesById.set(child.id, child);
          if (parent) {
            this.parentsById.set(child.id, parent);
          }
          indexNodes(child.children ?? [], child);
        }
      };
      indexNodes(this.roots);
    }
    return this.roots;
  }

  getParent(node: ModelTreeNode): ModelTreeNode | undefined {
    this.getChildren();
    return this.parentsById.get(node.id);
  }

  findEntityNode(entityId: string): ModelTreeNode | undefined {
    this.getChildren();
    return (
      this.nodesById.get(`software-component:${entityId}`) ??
      this.nodesById.get(`model-entity:${entityId}`) ??
      this.nodesById.get(entityId)
    );
  }

  findNode(nodeId: string): ModelTreeNode | undefined {
    this.getChildren();
    return this.nodesById.get(nodeId);
  }

  private buildRoots(): ModelTreeNode[] {

    if (!this.snapshot) {
      return this.indexing ? [makeIndexingNode()] : [];
    }

    if (!this.indexing && this.snapshot.files.length === 0) {
      return [makeEmptyWorkspaceNode()];
    }

    const filteredTree = filterModelTree(buildModelTree(this.snapshot, this.groupingMode), this.filterText);
    return this.indexing ? [makeIndexingNode(), ...filteredTree] : filteredTree;
  }
}

function makeIndexingNode(): ModelTreeNode {
  return {
    id: "autosar-indexing",
    label: "Indexing AUTOSAR model...",
    icon: "I",
    selectable: false
  };
}

function makeEmptyWorkspaceNode(): ModelTreeNode {
  return {
    id: "autosar-empty-workspace",
    label: "No ARXML files found",
    icon: "I",
    selectable: false
  };
}

function filterModelTree(nodes: ModelTreeNode[], filterText: string): ModelTreeNode[] {
  const normalizedFilter = normalizeTreeSearchText(filterText);
  if (!normalizedFilter) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filteredChildren = filterModelTree(node.children ?? [], normalizedFilter);
    if (getTreeNodeSearchText(node).includes(normalizedFilter)) {
      return [
        {
          ...node,
          forceExpanded: Boolean(node.children?.length),
          children: node.children
        }
      ];
    }
    if (filteredChildren.length > 0) {
      return [
        {
          ...node,
          forceExpanded: true,
          children: filteredChildren
        }
      ];
    }
    return [];
  });
}

function getTreeNodeSearchText(node: ModelTreeNode) {
  return normalizeTreeSearchText(
    [
      node.label,
      node.id,
      node.workspaceTab?.title,
      node.workspaceTab?.kind,
      node.workspaceTab?.serviceType,
      node.workspaceTab?.xmlPath
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function normalizeTreeSearchText(value: string) {
  return value.toLowerCase().trim();
}

function buildModelTree(workspace: WorkspaceSnapshot | null, groupingMode: TreeGroupingMode): ModelTreeNode[] {
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

  const rootComposition = compositions.find((composition) => composition.id === workspace.vectorEcu?.rootCompositionId);
  const makeCompositionTreeNode = (composition: AutosarEntity): ModelTreeNode => {
    const ports = portsByOwner.get(composition.semanticPath ?? "") ?? [];
    if (composition.id === rootComposition?.id) {
      return makeRootCompositionNode(composition, ports, workspace);
    }
    return makeCompositionNode(composition, ports, workspace);
  };
  const compositionTree: ModelTreeNode[] = compositions.map(makeCompositionTreeNode);
  const componentChildren = swcs.map((swc): ModelTreeNode => makeSwcNode(swc, portsByOwner.get(swc.semanticPath ?? "") ?? []));
  const componentFamilies = new Map<string, { entities: AutosarEntity[]; children: ModelTreeNode[] }>();

  componentChildren.forEach((child) => {
    const swc = swcs.find((entity) => `software-component:${entity.id}` === child.id);
    if (!swc) {
      return;
    }
    const familyLabel = formatSwcKindLabel(swc.swcKind);
    const family = componentFamilies.get(familyLabel) ?? { entities: [], children: [] };
    family.entities.push(swc);
    family.children.push(child);
    componentFamilies.set(familyLabel, family);
  });

  return [
    makeTopLevelNode("software-compositions", "Software Compositions", () =>
      groupingMode === "packages"
        ? buildPackageFolderTree(compositions, makeCompositionTreeNode, "software-compositions")
        : compositionTree
    ),
    makeTopLevelNode("software-components", "Software Components", () =>
      Array.from(componentFamilies.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, family]) => ({
          id: `software-components:${label}`,
          label,
          icon: "folder",
          selectable: false,
          children:
            groupingMode === "packages"
              ? buildPackageFolderTree(
                  family.entities,
                  (swc) => makeSwcNode(swc, portsByOwner.get(swc.semanticPath ?? "") ?? []),
                  `software-components:${label}`
                )
              : family.children
        }))
    ),
    makePortInterfacesNode(entities, groupingMode),
    makeDataTypesNode(entities, groupingMode),
    makeEntityCollectionNode(
      "constants",
      "Constants",
      entities,
      ["constant"],
      "K",
      groupingMode
    ),
    makeEntityCollectionNode(
      "mode-declaration-groups",
      "Mode Declaration Groups",
      entities,
      ["mode-declaration-group"],
      "Mo",
      groupingMode
    ),
    makeEntityCollectionNode(
      "type-mapping-sets",
      "Type Mapping Sets",
      entities,
      ["type-mapping-set"],
      "T",
      groupingMode
    ),
    makeEntityCollectionNode(
      "addressing-methods",
      "Addressing Methods",
      entities,
      ["addressing-method"],
      "A",
      groupingMode
    )
  ];
}

function makeCompositionNode(
  composition: AutosarEntity,
  ports: AutosarEntity[],
  workspace: WorkspaceSnapshot
): ModelTreeNode {
  return {
    id: composition.id,
    label: composition.shortName,
    icon: "C",
    focusEntityId: composition.id,
    preferredScope: "composition",
    workspaceTab: makeModelTab(composition, "graph", "Graph", {
      preferredScope: "composition",
      compositionTreeOrigin: "template"
    }),
    selectable: true,
    children: [
      makePortsWorkspaceNode(composition, ports, "composition", { compositionTreeOrigin: "template" }),
      ...makeCompositionChildren(composition, workspace, undefined, 0, "template")
    ]
  };
}

function makeRootCompositionNode(
  composition: AutosarEntity,
  ports: AutosarEntity[],
  workspace: WorkspaceSnapshot
): ModelTreeNode {
  const contextPaths: string[] = [];
  const instanceChildren = [
    ...makeCompositionChildren(composition, workspace, contextPaths, 0, "root"),
    ...makeRootServiceInstanceNodes(composition, workspace)
  ].sort((left, right) => left.label.localeCompare(right.label));
  return {
    id: composition.id,
    label: composition.shortName,
    icon: "C",
    tooltip: `Root software composition instance ${workspace.vectorEcu?.rootPrototypeName ?? composition.shortName}`,
    focusEntityId: composition.id,
    preferredScope: "composition",
    compositionContextPaths: contextPaths,
    selectable: true,
    workspaceTab: makeModelTab(composition, "graph", `Graph: ${composition.shortName}`, {
      preferredScope: "composition",
      compositionContextPaths: contextPaths,
      compositionTreeOrigin: "root"
    }),
    children: [
      makePortsWorkspaceNode(composition, ports, "composition", {
        compositionContextPaths: contextPaths,
        compositionTreeOrigin: "root"
      }),
      ...instanceChildren
    ]
  };
}

function makeRootServiceInstanceNodes(
  composition: AutosarEntity,
  workspace: WorkspaceSnapshot
): ModelTreeNode[] {
  const contextPaths: string[] = [];
  return getRootServiceInstances(workspace).map((serviceInstance): ModelTreeNode => ({
    id: `${composition.id}:service:${serviceInstance.id}`,
    label: serviceInstance.shortName,
    icon: "S",
    tooltip: `Service instance linked from FlatExtract: ${serviceInstance.semanticPath ?? serviceInstance.shortName}`,
    focusEntityId: composition.id,
    preferredScope: "composition",
    preferredNodeId: serviceInstance.id,
    compositionContextPaths: contextPaths,
    selectable: true,
    workspaceTab: makeModelTab(composition, "graph", `Graph: ${serviceInstance.shortName}`, {
      preferredScope: "composition",
      preferredNodeId: serviceInstance.id,
      compositionContextPaths: contextPaths,
      compositionTreeOrigin: "root"
    })
  })).sort((left, right) => left.label.localeCompare(right.label));
}

function makeCompositionChildren(
  composition: AutosarEntity,
  workspace: WorkspaceSnapshot,
  contextPaths: string[] | undefined,
  depth: number,
  treeOrigin: "template" | "root"
): ModelTreeNode[] {
  if (!composition.semanticPath || depth > 8) {
    return [];
  }
  const instances = workspace.entities.filter((entity) => {
    return entity.type === "instance" && entity.parentSemanticPath === composition.semanticPath;
  });

  return instances.map((instance): ModelTreeNode => {
    const typeEntity = workspace.entities.find((entity) => entity.semanticPath === instance.typeRef);
    const isComposition = typeEntity?.type === "composition";
    let childContext: string[] | undefined;
    if (instance.semanticPath) {
      // Descendants of a composition prototype belong to that prototype even
      // when the containing composition was opened as a type template.
      childContext = [...(contextPaths ?? []), instance.semanticPath];
    }
    const contextKey = contextPaths?.join(":") ?? "template";
    const treeNodeId = treeOrigin === "template" && contextPaths
      ? `${composition.id}:template:${contextKey}:${instance.id}`
      : `${composition.id}:${contextKey}:${instance.id}`;
    return {
      id: treeNodeId,
      label: instance.shortName,
      icon: isComposition ? "C" : "I",
      focusEntityId: composition.id,
      preferredScope: "composition",
      preferredNodeId: instance.id,
      compositionContextPaths: contextPaths,
      selectable: true,
      workspaceTab: makeModelTab(composition, "graph", `Graph: ${instance.shortName}`, {
        preferredScope: "composition",
        preferredNodeId: instance.id,
        compositionContextPaths: contextPaths,
        compositionTreeOrigin: treeOrigin
      }),
      children: isComposition
        ? makeCompositionChildren(typeEntity, workspace, childContext, depth + 1, treeOrigin)
        : undefined
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function makeSwcNode(swc: AutosarEntity, ports: AutosarEntity[]): ModelTreeNode {
  return {
    id: `software-component:${swc.id}`,
    label: swc.shortName,
    icon: formatSwcKindIcon(swc.swcKind),
    focusEntityId: swc.id,
    preferredScope: "swc",
    selectable: true,
    workspaceTab: makeModelTab(swc, "graph", "Graph", {
      preferredScope: "swc"
    }),
    children: buildSwcWorkspaceChildren(swc, ports)
  };
}

function makeTopLevelNode(
  id: string,
  label: string,
  childrenFactory: () => ModelTreeNode[]
): ModelTreeNode {
  return {
    id,
    label,
    icon: "folder",
    selectable: false,
    children: childrenFactory()
  };
}

function makePortInterfacesNode(entities: AutosarEntity[], groupingMode: TreeGroupingMode): ModelTreeNode {
  const interfaces = entities.filter((entity) => entity.type === "interface");
  return makeTopLevelNode("port-interfaces", "Port Interfaces", () => [
    makeEntityCollectionNode(
      "port-interfaces:application",
      "Application Port Interfaces",
      interfaces.filter((entity) => !isServicePortInterface(entity)),
      ["interface"],
      "I",
      groupingMode
    ),
    makeEntityCollectionNode(
      "port-interfaces:service",
      "Service Port Interfaces",
      interfaces.filter(isServicePortInterface),
      ["interface"],
      "S",
      groupingMode
    )
  ]);
}

function makeDataTypesNode(entities: AutosarEntity[], groupingMode: TreeGroupingMode): ModelTreeNode {
  return makeTopLevelNode("data-types", "Data Types", () => [
    makeEntityCollectionNode("data-types:application", "Application Data Types", entities, ["application-data-type"], "A", groupingMode),
    makeEntityCollectionNode(
      "data-types:implementation",
      "Implementation Data Types",
      entities,
      ["implementation-data-type"],
      "I",
      groupingMode
    ),
    makeEntityCollectionNode("data-types:base", "Base Types", entities, ["base-type"], "B", groupingMode),
    makeEntityCollectionNode("data-types:units", "Units", entities, ["unit"], "U", groupingMode),
    makeEntityCollectionNode("data-types:compu-methods", "Compu Methods", entities, ["compu-method"], "C", groupingMode),
    makeEntityCollectionNode(
      "data-types:data-constraints",
      "Data Constraints",
      entities,
      ["data-constraint"],
      "D",
      groupingMode
    ),
    makeEntityCollectionNode("data-types:record-layouts", "Record Layouts", entities, ["record-layout"], "R", groupingMode)
  ]);
}

function makeEntityCollectionNode(
  id: string,
  label: string,
  entities: AutosarEntity[],
  entityTypes: string[],
  icon: string,
  groupingMode: TreeGroupingMode = "semantic"
): ModelTreeNode {
  const matchingEntities = entities
    .filter((entity) => entityTypes.includes(entity.type))
    .slice()
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
  const children =
    groupingMode === "packages"
      ? buildPackageFolderTree(matchingEntities, (entity) => makePlainEntityNode(entity, icon), id)
      : matchingEntities.map((entity): ModelTreeNode => makePlainEntityNode(entity, icon));

  return {
    id,
    label,
    icon: "folder",
    selectable: false,
    children
  };
}

interface PackageFolderBuilder {
  label: string;
  children: Map<string, PackageFolderBuilder>;
  leaves: ModelTreeNode[];
}

function buildPackageFolderTree(
  entities: AutosarEntity[],
  makeLeafNode: (entity: AutosarEntity) => ModelTreeNode,
  idPrefix: string
): ModelTreeNode[] {
  const root: PackageFolderBuilder = {
    label: "",
    children: new Map(),
    leaves: []
  };

  for (const entity of entities) {
    const segments = getPackagePathSegments(entity);
    let cursor = root;
    for (const segment of segments) {
      const existing = cursor.children.get(segment);
      const next =
        existing ??
        {
          label: segment,
          children: new Map<string, PackageFolderBuilder>(),
          leaves: []
        };
      cursor.children.set(segment, next);
      cursor = next;
    }
    cursor.leaves.push(makeLeafNode(entity));
  }

  return materializePackageFolders(root, idPrefix);
}

function materializePackageFolders(folder: PackageFolderBuilder, idPrefix: string): ModelTreeNode[] {
  const childFolders = Array.from(folder.children.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((child) => ({
      id: `${idPrefix}:package:${child.label}`,
      label: child.label,
      icon: "folder",
      selectable: false,
      children: materializePackageFolders(child, `${idPrefix}:package:${child.label}`)
    }));
  const leaves = folder.leaves.slice().sort((left, right) => left.label.localeCompare(right.label));
  return [...childFolders, ...leaves];
}

function getPackagePathSegments(entity: AutosarEntity) {
  return (entity.packagePath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function makePlainEntityNode(entity: AutosarEntity, icon: string): ModelTreeNode {
  return {
    id: `model-entity:${entity.id}`,
    label: entity.shortName,
    icon,
    focusEntityId: entity.id,
    selectable: true,
    workspaceTab: makeModelTab(entity, "entityDetails", getEntityDetailTitle(entity), {
      entityId: entity.id,
      xmlPath: entity.xmlPath
    })
  };
}

function getEntityDetailTitle(entity: AutosarEntity) {
  const typeLabel = entity.rawTagName
    ? entity.rawTagName
        .toLowerCase()
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "AUTOSAR Element";
  return `${typeLabel}: ${entity.shortName}`;
}

function isServicePortInterface(entity: AutosarEntity) {
  const value = entity.metadata?.["IS-SERVICE"]?.toLowerCase();
  return value === "true" || value === "1";
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
    makePortsWorkspaceNode(swc, ports, "swc"),
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

function makePortsWorkspaceNode(
  owner: AutosarEntity,
  ports: AutosarEntity[],
  scope: SwcGraphScope,
  tabOptions: Partial<ModelWorkspaceTab> = {}
): ModelTreeNode {
  return {
    id: `${owner.id}:ports`,
    label: "Ports",
    icon: formatModelWorkspaceIcon("ports"),
    focusEntityId: owner.id,
    preferredScope: scope,
    selectable: true,
    workspaceTab: makeModelTab(owner, "ports", "Ports", { ...tabOptions, preferredScope: scope }),
    children: ports
      .slice()
      .sort((left, right) => left.shortName.localeCompare(right.shortName))
      .map((port) => ({
        id: `${owner.id}:port:${port.id}`,
        label: port.shortName,
        icon: formatPortIcon(port),
        focusEntityId: owner.id,
        preferredScope: scope,
        selectable: true,
        workspaceTab: makeModelTab(owner, "port", `Port: ${port.shortName}`, {
          ...tabOptions,
          preferredScope: scope,
          entityId: port.id,
          xmlPath: port.xmlPath
        })
      }))
  };
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
    }${options.compositionContextPaths ? `:context:${options.compositionContextPaths.join("|") || "root"}` : ""}${
      options.compositionTreeOrigin === "template" ? ":template-origin" : ""
    }`,
    title: titlePrefix.includes(":") ? titlePrefix : `${titlePrefix}: ${entity.shortName}`,
    pinned: options.pinned,
    kind,
    focusEntityId: entity.id,
    preferredScope: options.preferredScope,
    preferredNodeId: options.preferredNodeId,
    includeCompositionInternals: options.includeCompositionInternals,
    compositionContextPaths: options.compositionContextPaths,
    compositionTreeOrigin: options.compositionTreeOrigin,
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

  if (node.forceExpanded) {
    return vscode.TreeItemCollapsibleState.Expanded;
  }

  if (node.id === "software-compositions" || node.id === "software-components") {
    return vscode.TreeItemCollapsibleState.Expanded;
  }

  return vscode.TreeItemCollapsibleState.Collapsed;
}

function getNodeIconPath(node: ModelTreeNode) {
  if (node.id.startsWith("software-components:")) {
    return makeBadgeIcon("folder");
  }
  return node.icon ? makeBadgeIcon(node.icon) : undefined;
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
