import type {
  AutosarEntity,
  ConnectedPortReference,
  SwcGraphResult,
  SwcInspectorData
} from "../../../../../src/shared/contracts";
import type { ModelWorkspaceTab } from "../../EditorTabs/EditorTabs";
import type { DetailBreadcrumb } from "../../Common/Details/DetailsBottomTabs/DetailsBottomTabs";
import {
  collectInspectorItems,
  findInspectorItem,
  findInspectorItemInSections,
  getEmptyLabel,
  getSectionsForTab,
  getDetailsColumns
} from "./SwcDetailsHelper";
import { ParameterDetails } from "./ParameterDetails/ParameterDetails";
import { InterRunnableVariableDetails } from "./InterRunnableVariableDetails/InterRunnableVariableDetails";
import { PerInstanceMemoryDetails } from "./PerInstanceMemoryDetails/PerInstanceMemoryDetails";
import { ServiceDependencyDetails } from "./ServiceDependency/ServiceDependencyDetails";
import { RunnableDetails } from "./RunnableDetails";
import { PortDetails } from "./PortDetails/PortDetails";
import { VariablesTable } from "./TableData/VariablesTable";
import { SimpleTable } from "./TableData/SimpleTable";
import { PortsTable } from "./TableData/PortsTable";
import { RunnablesTable } from "./TableData/RunnablesTable";
import { DetailsLoading } from "../../Common/Details/DetailsLoading";

export function SwcDetails(props: {
  tab: ModelWorkspaceTab;
  focusEntity?: AutosarEntity;
  modelEntities?: AutosarEntity[];
  graphResult?: SwcGraphResult;
  graphError?: string;
  inspector?: SwcInspectorData;
  connectedPortsByPortId: Record<string, ConnectedPortReference[]>;
  onConnectedPortSelect?: (connection: ConnectedPortReference) => void;
  onOpenWorkspaceTab?: (tab: ModelWorkspaceTab) => void;
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
  breadcrumbs?: DetailBreadcrumb[];
}) {
  const inspectorData = props.inspector ?? props.focusEntity?.inspector;
  const ports = props.graphResult?.nodes.find((node) => node.id === props.focusEntity?.id)?.ports ?? props.graphResult?.nodes[0]?.ports ?? [];

  if (!props.focusEntity) {
    return <div className="empty-state">Select an AUTOSAR model entity.</div>;
  }

  if (props.tab.kind === "runnables") {
    const runnables = inspectorData?.sections.find((section) => section.id === "runnables")?.items ?? [];
    return (
      <RunnablesTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        swcName={props.focusEntity.shortName}
        runnables={runnables}
        focusEntityId={props.focusEntity.id}
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  if (props.tab.kind === "ports") {
    return (
      <PortsTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        ports={ports}
        focusEntityId={props.focusEntity.id}
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  if (props.tab.kind === "parameters") {
    return (
      <VariablesTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        items={collectInspectorItems(inspectorData, ["calibrationVariables", "interfaceParameters"])}
        focusEntityId={props.focusEntity.id}
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
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  if (props.tab.kind === "interRunnableVariables") {
    return (
      <VariablesTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        items={collectInspectorItems(inspectorData, ["interRunnableVariables"])}
        focusEntityId={props.focusEntity.id}
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
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  if (props.tab.kind === "perInstanceMemory") {
    return (
      <VariablesTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        items={collectInspectorItems(inspectorData, ["perInstanceMemory"])}
        focusEntityId={props.focusEntity.id}
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
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  if (props.tab.kind === "serviceDependencies" || props.tab.kind === "serviceDependencyGroup") {
    const serviceItems = collectInspectorItems(inspectorData, ["serviceDependencies"]).filter(
      (entry) => !props.tab.serviceType || entry.item.metadata?.["SERVICE-TYPE"] === props.tab.serviceType
    );
    return (
      <VariablesTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        items={serviceItems}
        focusEntityId={props.focusEntity.id}
        detailKind="serviceDependency"
        detailTitlePrefix="Service Need"
        emptyLabel="No service needs discovered."
        filterPlaceholder="Filter service needs"
        columns={[
          { key: "label", label: "Name" },
          { key: "SERVICE-TYPE", label: "Service Type" },
          { key: "ASSIGNED-PORT-PROTOTYPE", label: "Assigned Port" }
        ]}
        onOpenWorkspaceTab={props.onOpenWorkspaceTab}
      />
    );
  }

  if (props.tab.kind === "port") {
    const port =
      ports.find((entry) => entry.id === props.tab.entityId || entry.xmlPath === props.tab.xmlPath) ??
      props.graphResult?.nodes.flatMap((node) => node.ports).find((entry) => entry.id === props.tab.entityId);
    if (!port) {
      return (
        <DetailsLoading
          title={props.tab.title}
          breadcrumbs={props.breadcrumbs}
          message={props.graphError ?? (props.graphResult ? "Port details are unavailable." : "Loading port details…")}
          loading={!props.graphError && !props.graphResult}
        />
      );
    }
    return (
      <PortDetails
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        port={port}
        modelEntities={props.modelEntities}
        ownerKind={props.focusEntity.type === "composition" ? "Software composition" : "Software component"}
        ownerSwcKind={props.focusEntity.swcKind}
        connectedPorts={port ? props.connectedPortsByPortId[port.id] ?? [] : []}
        onConnectedPortSelect={props.onConnectedPortSelect}
        filePath={port?.filePath ?? props.focusEntity.filePath}
        xmlPath={port?.xmlPath ?? props.tab.xmlPath}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
      />
    );
  }

  if (props.tab.kind === "parameter") {
    const item =
      props.tab.sectionId && props.tab.itemId
        ? findInspectorItem(inspectorData, props.tab.sectionId, props.tab.itemId)
        : findInspectorItemInSections(inspectorData, ["calibrationVariables", "interfaceParameters"], props.tab.itemId);
    return (
      <ParameterDetails
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        parameter={item}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
      />
    );
  }

  if (props.tab.kind === "interRunnableVariable") {
    const item =
      props.tab.sectionId && props.tab.itemId
        ? findInspectorItem(inspectorData, props.tab.sectionId, props.tab.itemId)
        : findInspectorItemInSections(inspectorData, ["interRunnableVariables"], props.tab.itemId);
    return (
      <InterRunnableVariableDetails
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        variable={item}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
      />
    );
  }

  if (props.tab.kind === "perInstanceMemoryItem") {
    const item =
      props.tab.sectionId && props.tab.itemId
        ? findInspectorItem(inspectorData, props.tab.sectionId, props.tab.itemId)
        : findInspectorItemInSections(inspectorData, ["perInstanceMemory"], props.tab.itemId);
    return (
      <PerInstanceMemoryDetails
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        item={item}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
      />
    );
  }

  if (props.tab.kind === "serviceDependency") {
    const item =
      props.tab.sectionId && props.tab.itemId
        ? findInspectorItem(inspectorData, props.tab.sectionId, props.tab.itemId)
        : findInspectorItemInSections(inspectorData, ["serviceDependencies"], props.tab.itemId);
    return <ServiceDependencyDetails
      title={props.tab.title}
      item={item}
      breadcrumbs={props.breadcrumbs}
      onOpenReferencedEntity={props.onOpenReferencedEntity}
      canOpenReferencedEntity={props.canOpenReferencedEntity}
    />;
  }

  if (props.tab.kind === "runnable") {
    const runnable = findInspectorItem(inspectorData, "runnables", props.tab.itemId);
    return (
      <RunnableDetails
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        runnable={runnable}
        filePath={props.focusEntity.filePath}
        xmlPath={runnable?.xmlPath ?? props.tab.xmlPath}
        onOpenReferencedEntity={props.onOpenReferencedEntity}
        canOpenReferencedEntity={props.canOpenReferencedEntity}
      />
    );
  }

  if (props.tab.kind === "behavior") {
    return (
      <SimpleTable
        title={props.tab.title}
        breadcrumbs={props.breadcrumbs}
        emptyLabel="No behavior details discovered."
        columns={[
          { key: "section", label: "Section" },
          { key: "count", label: "Items" }
        ]}
        rows={(inspectorData?.sections ?? []).map((section) => ({
          id: section.id,
          section: section.label,
          count: String(section.items.length)
        }))}
      />
    );
  }

  const sectionIds = getSectionsForTab(props.tab.kind);
  const rows = sectionIds.flatMap((sectionId) => {
    const section = inspectorData?.sections.find((entry) => entry.id === sectionId);
    return (section?.items ?? []).map((item) => ({
      id: `${sectionId}:${item.id}`,
      label: item.label,
      section: section?.label ?? sectionId,
      ...item.metadata,
      filePath: props.focusEntity?.filePath,
      xmlPath: item.xmlPath
    }));
  });

  return (
    <SimpleTable
      title={props.tab.title}
      breadcrumbs={props.breadcrumbs}
      emptyLabel={getEmptyLabel(props.tab.kind)}
      columns={getDetailsColumns(props.tab.kind)}
      rows={rows}
    />
  );
}
