import type {
  AutosarEntity,
  ConnectedPortReference,
  PortConnection
} from "../shared/contracts";

/** Builds a project-wide lookup from each port prototype to its connected ports. */
export function buildConnectedPortsByPortId(
  entities: AutosarEntity[],
  connections: PortConnection[]
): Record<string, ConnectedPortReference[]> {
  const entitiesBySemanticPath = new Map(
    entities
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath!, entity])
  );
  const connectedPortsByPortId: Record<string, ConnectedPortReference[]> = {};

  function addConnection(
    connection: PortConnection,
    sourcePortRef: string | undefined,
    targetPortRef: string | undefined,
    targetComponentRef: string | undefined
  ) {
    if (!sourcePortRef || !targetPortRef) {
      return;
    }

    const sourcePort = entitiesBySemanticPath.get(sourcePortRef);
    if (!sourcePort || sourcePort.type !== "port") {
      return;
    }

    const targetPort = entitiesBySemanticPath.get(targetPortRef);
    const targetComponent = targetComponentRef
      ? entitiesBySemanticPath.get(targetComponentRef)
      : undefined;
    const targetPortOwner = targetPort?.parentSemanticPath
      ? entitiesBySemanticPath.get(targetPort.parentSemanticPath)
      : undefined;
    const targetComponentType = targetComponent?.typeRef
      ? entitiesBySemanticPath.get(targetComponent.typeRef)
      : undefined;
    const targetOwnerEntity = targetComponentType ?? targetPortOwner;
    const swcPath =
      targetComponent?.semanticPath ??
      targetComponentRef ??
      targetPortOwner?.semanticPath ??
      targetPort?.parentSemanticPath ??
      "-";

    const reference: ConnectedPortReference = {
      connectionId: connection.id,
      portId: targetPort?.id,
      ...(targetPort?.xmlPath ? { portXmlPath: targetPort.xmlPath } : {}),
      portName: targetPort?.shortName ?? getReferenceLeafName(targetPortRef),
      portInterface: getReferenceLeafName(targetPort?.typeRef),
      portInterfaceRef: targetPort?.typeRef,
      ownerEntityId: targetOwnerEntity?.id,
      ownerSemanticPath: targetOwnerEntity?.semanticPath,
      swcName:
        targetComponent?.shortName ??
        targetPortOwner?.shortName ??
        getReferenceLeafName(targetComponentRef ?? targetPort?.parentSemanticPath),
      swcPath
    };

    (connectedPortsByPortId[sourcePort.id] ??= []).push(reference);
  }

  for (const connection of connections) {
    if (connection.kind === "assembly") {
      addConnection(
        connection,
        connection.sourcePortRef,
        connection.targetPortRef,
        connection.requesterComponentRef
      );
      addConnection(
        connection,
        connection.targetPortRef,
        connection.sourcePortRef,
        connection.providerComponentRef
      );
      continue;
    }

    addConnection(
      connection,
      connection.sourcePortRef,
      connection.outerPortRef,
      getParentReference(connection.outerPortRef)
    );
    addConnection(
      connection,
      connection.outerPortRef,
      connection.sourcePortRef,
      connection.providerComponentRef
    );
  }

  for (const references of Object.values(connectedPortsByPortId)) {
    references.sort((left, right) => {
      const swcOrder = left.swcName.localeCompare(right.swcName);
      if (swcOrder !== 0) {
        return swcOrder;
      }
      return left.portName.localeCompare(right.portName);
    });
  }

  return connectedPortsByPortId;
}

function getReferenceLeafName(reference: string | undefined) {
  if (!reference) {
    return "-";
  }

  const segments = reference.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? reference;
}

function getParentReference(reference: string | undefined) {
  if (!reference) {
    return undefined;
  }

  const segments = reference.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return undefined;
  }
  return `/${segments.slice(0, -1).join("/")}`;
}
