import type { AutosarEntity, SwcGraphResult, SwcInspectorData } from "../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../tabs/modelWorkspaceTab";
import {
  collectInspectorItems,
  findInspectorItem,
  findInspectorItemInSections,
  getEmptyLabel,
  getSectionsForTab,
  getSemanticColumns,
  ModelEntityDetailsSurface,
  ModelInterRunnableVariableSurface,
  ModelParameterSurface,
  ModelPerInstanceMemorySurface,
  ModelPortSurface,
  ModelRunnableSurface,
  ModelServiceDependencySurface
} from "./SemanticSurfaces";
import {
  ModelInspectorItemsTableSurface,
  ModelPortsTableSurface,
  ModelRunnablesTableSurface,
  ModelTableSurface
} from "./SemanticTableSurfaces";

export function ModelSemanticTab(props: {
  tab: ModelWorkspaceTab;
  focusEntity?: AutosarEntity;
  graphResult?: SwcGraphResult;
  inspector?: SwcInspectorData;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
}) {
  const {
    tab,
    focusEntity,
    graphResult,
    inspector,
    onOpenWorkspaceTab
  } = props;
  const semanticInspector = inspector ?? focusEntity?.inspector;
  const ports = graphResult?.nodes.find((node) => node.id === focusEntity?.id)?.ports ?? graphResult?.nodes[0]?.ports ?? [];

  if (!focusEntity) {
    return <div className="empty-state">Select an AUTOSAR model entity.</div>;
  }

  if (tab.kind === "entityDetails") {
    return <ModelEntityDetailsSurface title={tab.title} entity={focusEntity} />;
  }

  if (tab.kind === "runnables") {
    const runnables = semanticInspector?.sections.find((section) => section.id === "runnables")?.items ?? [];
    return (
      <ModelRunnablesTableSurface
        title={tab.title}
        swcName={focusEntity.shortName}
        runnables={runnables}
        focusEntityId={focusEntity.id}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "ports") {
    return (
      <ModelPortsTableSurface
        title={tab.title}
        ports={ports}
        focusEntityId={focusEntity.id}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "parameters") {
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={collectInspectorItems(semanticInspector, ["calibrationVariables", "interfaceParameters"])}
        focusEntityId={focusEntity.id}
        detailKind="parameter"
        detailTitlePrefix="Parameter"
        emptyLabel="No parameters discovered."
        filterPlaceholder="Filter parameters"
        columns={[
          { key: "label", label: "Parameter Name" },
          { key: "TYPE", label: "Type" },
          { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
          { key: "SCOPE", label: "Scope" },
          { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "interRunnableVariables") {
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={collectInspectorItems(semanticInspector, ["interRunnableVariables"])}
        focusEntityId={focusEntity.id}
        detailKind="interRunnableVariable"
        detailTitlePrefix="Inter-Runnable Variable"
        emptyLabel="No inter-runnable variables discovered."
        filterPlaceholder="Filter inter-runnable variables"
        columns={[
          { key: "label", label: "Name" },
          { key: "TYPE", label: "Data Type" },
          { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
          { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "perInstanceMemory") {
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={collectInspectorItems(semanticInspector, ["perInstanceMemory"])}
        focusEntityId={focusEntity.id}
        detailKind="perInstanceMemoryItem"
        detailTitlePrefix="Per-Instance Memory"
        emptyLabel="No per-instance memory discovered."
        filterPlaceholder="Filter per-instance memory"
        columns={[
          { key: "label", label: "Name" },
          { key: "TYPE", label: "Data Type" },
          { key: "INITIAL-VALUE-TYPE", label: "Init Value Type" },
          { key: "SW-CALIBRATION-ACCESS", label: "Measurement&Calibration" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "serviceDependencies" || tab.kind === "serviceDependencyGroup") {
    const serviceItems = collectInspectorItems(semanticInspector, ["serviceDependencies"]).filter(
      (entry) => !tab.serviceType || entry.item.metadata?.["SERVICE-TYPE"] === tab.serviceType
    );
    return (
      <ModelInspectorItemsTableSurface
        title={tab.title}
        items={serviceItems}
        focusEntityId={focusEntity.id}
        detailKind="serviceDependency"
        detailTitlePrefix="Service Need"
        emptyLabel="No service needs discovered."
        filterPlaceholder="Filter service needs"
        columns={[
          { key: "label", label: "Name" },
          { key: "SERVICE-TYPE", label: "Service Type" },
          { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
        ]}
        onOpenWorkspaceTab={onOpenWorkspaceTab}
      />
    );
  }

  if (tab.kind === "port") {
    const port =
      ports.find((entry) => entry.id === tab.entityId || entry.xmlPath === tab.xmlPath) ??
      graphResult?.nodes.flatMap((node) => node.ports).find((entry) => entry.id === tab.entityId);
    return (
      <ModelPortSurface
        title={tab.title}
        port={port}
        filePath={port?.filePath ?? focusEntity.filePath}
        xmlPath={port?.xmlPath ?? tab.xmlPath}
      />
    );
  }

  if (tab.kind === "parameter") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["calibrationVariables", "interfaceParameters"], tab.itemId);
    return <ModelParameterSurface title={tab.title} parameter={item} />;
  }

  if (tab.kind === "interRunnableVariable") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["interRunnableVariables"], tab.itemId);
    return <ModelInterRunnableVariableSurface title={tab.title} variable={item} />;
  }

  if (tab.kind === "perInstanceMemoryItem") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["perInstanceMemory"], tab.itemId);
    return <ModelPerInstanceMemorySurface title={tab.title} item={item} />;
  }

  if (tab.kind === "serviceDependency") {
    const item =
      tab.sectionId && tab.itemId
        ? findInspectorItem(semanticInspector, tab.sectionId, tab.itemId)
        : findInspectorItemInSections(semanticInspector, ["serviceDependencies"], tab.itemId);
    return <ModelServiceDependencySurface title={tab.title} item={item} />;
  }

  if (tab.kind === "runnable") {
    const runnable = findInspectorItem(semanticInspector, "runnables", tab.itemId);
    return (
      <ModelRunnableSurface
        title={tab.title}
        runnable={runnable}
        filePath={focusEntity.filePath}
        xmlPath={runnable?.xmlPath ?? tab.xmlPath}
      />
    );
  }

  if (tab.kind === "behavior") {
    return (
      <ModelTableSurface
        title={tab.title}
        emptyLabel="No behavior details discovered."
        columns={[
          { key: "section", label: "Section" },
          { key: "count", label: "Items" }
        ]}
        rows={(semanticInspector?.sections ?? []).map((section) => ({
          id: section.id,
          section: section.label,
          count: String(section.items.length)
        }))}
      />
    );
  }

  const sectionIds = getSectionsForTab(tab.kind);
  const rows = sectionIds.flatMap((sectionId) => {
    const section = semanticInspector?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({
      id: `${sectionId}:${item.id}`,
      label: item.label,
      section: section?.label ?? sectionId,
      ...item.metadata,
      filePath: focusEntity.filePath,
      xmlPath: item.xmlPath
    }));
  });

  return (
    <ModelTableSurface
      title={tab.title}
      emptyLabel={getEmptyLabel(tab.kind)}
      columns={getSemanticColumns(tab.kind)}
      rows={rows}
    />
  );
}
