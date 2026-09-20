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
  // Legacy extraction stores structured values as JSON strings in metadata.
  // Decode them here, at the model boundary, so React receives typed data and
  // never needs to understand the serialization format.
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

  let serializedInterfaceMembers = metadata["INTERFACE-DATA-ELEMENT-DETAILS"];
  if (!serializedInterfaceMembers) {
    serializedInterfaceMembers = metadata["INTERFACE-MEMBER-DETAILS"];
  }

  const interfaceMembers = parseArray<InterfaceDetailMember>(serializedInterfaceMembers).map((member) => ({
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

  if (!hasValues(details)) {
    return undefined;
  }
  return details;
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
  if (hasValues(details)) {
    item.details = details;
  } else {
    item.details = undefined;
  }
}

function parseArray<T>(value: string | undefined): T[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as T[];
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as T;
  } catch {
    return undefined;
  }
}

function hasValues(details: object) {
  for (const value of Object.values(details)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    return true;
  }
  return false;
}

function readCell(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "-";
  }
  return value;
}

function readOptionalCell(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value;
}
