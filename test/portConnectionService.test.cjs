const assert = require("node:assert/strict");
const test = require("node:test");
const { buildConnectedPortsByPortId } = require("../src/model/portConnectionService.ts");

test("indexes both sides of an assembly connection with connected port details", () => {
  const entities = [
    entity("sender-swc", "swc", "SenderSwc", "/Components/SenderSwc"),
    entity("receiver-swc", "swc", "ReceiverSwc", "/Components/ReceiverSwc"),
    instance("sender-instance", "SenderInstance", "/Composition/SenderInstance", "/Components/SenderSwc"),
    instance("receiver-instance", "ReceiverInstance", "/Composition/ReceiverInstance", "/Components/ReceiverSwc"),
    port("sender-port", "Output", "/Components/SenderSwc/Output", "/Components/SenderSwc", "/Interfaces/Signal", "provided"),
    port("receiver-port", "Input", "/Components/ReceiverSwc/Input", "/Components/ReceiverSwc", "/Interfaces/Signal", "required")
  ];
  const connections = [
    {
      id: "connection-1",
      kind: "assembly",
      label: "SignalConnection",
      from: "/Components/SenderSwc/Output",
      to: "/Components/ReceiverSwc/Input",
      filePath: "model.arxml",
      providerComponentRef: "/Composition/SenderInstance",
      requesterComponentRef: "/Composition/ReceiverInstance",
      sourcePortRef: "/Components/SenderSwc/Output",
      targetPortRef: "/Components/ReceiverSwc/Input"
    }
  ];

  const index = buildConnectedPortsByPortId(entities, connections);

  assert.deepEqual(index["sender-port"], [
    {
      connectionId: "connection-1",
      portId: "receiver-port",
      portName: "Input",
      portDirection: "required",
      interfaceKind: "sender-receiver",
      portInterface: "Signal",
      portInterfaceRef: "/Interfaces/Signal",
      ownerEntityId: "receiver-swc",
      ownerSemanticPath: "/Components/ReceiverSwc",
      swcName: "ReceiverInstance",
      swcPath: "/Composition/ReceiverInstance"
    }
  ]);
  assert.equal(index["receiver-port"][0].swcName, "SenderInstance");
  assert.equal(index["receiver-port"][0].portName, "Output");
  assert.equal(index["receiver-port"][0].portDirection, "provided");
});

test("ignores a connection when the source port cannot be resolved", () => {
  const connections = [
    {
      id: "unresolved",
      kind: "assembly",
      label: "Unresolved",
      from: "/Missing/Source",
      to: "/Missing/Target",
      filePath: "model.arxml",
      sourcePortRef: "/Missing/Source",
      targetPortRef: "/Missing/Target"
    }
  ];

  assert.deepEqual(buildConnectedPortsByPortId([], connections), {});
});

function entity(id, type, shortName, semanticPath) {
  return { id, type, shortName, semanticPath, path: semanticPath, filePath: "model.arxml" };
}

function instance(id, shortName, semanticPath, typeRef) {
  return {
    ...entity(id, "instance", shortName, semanticPath),
    typeRef
  };
}

function port(id, shortName, semanticPath, parentSemanticPath, typeRef, portDirection) {
  return {
    ...entity(id, "port", shortName, semanticPath),
    parentSemanticPath,
    typeRef,
    portDirection,
    interfaceKind: "sender-receiver"
  };
}
