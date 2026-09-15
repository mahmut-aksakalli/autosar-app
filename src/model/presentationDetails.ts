import type {
  AutosarEntity,
  AutosarEntityDetails,
  CommunicationSpecDetail,
  EntityDetailPayload,
  InterfaceDetailMember,
  InterRunnableVariableAccessDetail,
  PortDefinedArgumentValueDetail,
  RunnableAccessPointDetail,
  RunnableActivationReasonDetail,
  RunnableTriggerEventDetail,
  ServiceAssignedDataDetail,
  ServiceAssignedPortDetail,
  ServiceNeedField,
  SwcInspectorItem
} from "../shared/contracts";

export function hydratePresentationDetails(entities: AutosarEntity[]) {
  entities.forEach((entity) => {
    entity.details = readEntityDetails(entity);
    entity.inspector?.sections.forEach((section) => {
      section.items.forEach(hydrateInspectorItemDetails);
    });
  });
}

function readEntityDetails(entity: AutosarEntity): AutosarEntityDetails | undefined {
  const metadata = entity.metadata;
  if (!metadata) {
    return undefined;
  }

  const interfaceMembers = parseArray<InterfaceDetailMember>(
    metadata["INTERFACE-DATA-ELEMENT-DETAILS"] ?? metadata["INTERFACE-MEMBER-DETAILS"]
  ).map((member) => ({
    ...member,
    operationArguments: parseArray<Record<string, string>>(member.metadata?.["ARGUMENT-DETAILS"])
  }));
  const details: AutosarEntityDetails = {
    entity: parseObject<EntityDetailPayload>(metadata["ENTITY-DETAILS"]),
    interfaceMembers,
    portDefinedArgumentValues: parseArray<PortDefinedArgumentValueDetail>(
      metadata["PORT-DEFINED-ARGUMENT-VALUES"]
    ),
    communicationSpecs: parseArray<CommunicationSpecDetail>(metadata["COMMUNICATION-SPEC-DETAILS"])
  };

  return hasValues(details) ? details : undefined;
}

function hydrateInspectorItemDetails(item: SwcInspectorItem) {
  const metadata = item.metadata;
  if (!metadata) {
    return;
  }

  const details = {
    accessPoints: parseArray<RunnableAccessPointDetail>(metadata["ACCESS-POINT-DETAILS"]),
    interRunnableVariableAccesses: parseArray<InterRunnableVariableAccessDetail>(
      metadata["INTER-RUNNABLE-VARIABLE-ACCESS"]
    ),
    activationReasons: parseArray<RunnableActivationReasonDetail>(metadata["ACTIVATION-REASON-DETAILS"]),
    triggerEvents: parseArray<RunnableTriggerEventDetail>(metadata["TRIGGER-EVENT-DETAILS"]),
    serviceNeedFields: parseArray<ServiceNeedField>(metadata["SERVICE-NEED-DETAIL-FIELDS"]),
    assignedData: parseArray<Record<string, unknown>>(metadata["ASSIGNED-DATA-DETAILS"]).map((entry) => ({
      assignedRole: readCell(entry.assignedRole ?? entry.role),
      value: readCell(entry.value),
      portPrototype: readCell(entry.portPrototype),
      portPrototypeRef: readOptionalCell(entry.portPrototypeRef),
      portInterface: readCell(entry.portInterface),
      portInterfaceRef: readOptionalCell(entry.portInterfaceRef),
      dataElementPrototype: readCell(entry.dataElementPrototype ?? entry.value),
      dataElementPrototypeRef: readOptionalCell(entry.dataElementPrototypeRef)
    } satisfies ServiceAssignedDataDetail)),
    assignedPorts: parseArray<ServiceAssignedPortDetail>(metadata["ASSIGNED-PORT-DETAILS"])
  };
  item.details = hasValues(details) ? details : undefined;
}

function parseArray<T>(value: string | undefined): T[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseObject<T extends object>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

function hasValues(details: object) {
  return Object.values(details).some((value) => value !== undefined && (!Array.isArray(value) || value.length > 0));
}

function readCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function readOptionalCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
