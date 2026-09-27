const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemberComSpecDescriptions } = require("../webview/src/components/AutosarEditor/PortInterfaceDetails/PortInterfaceComSpecHelper.ts");

test("lists only port-owned ComSpecs that reference each interface member", () => {
  const members = [
    { label: "Speed", semanticPath: "/Interfaces/Signals/Speed" },
    { label: "Temperature", semanticPath: "/Interfaces/Signals/Temperature" }
  ];
  const instances = [
    { portId: "sender-port" },
    { portId: "receiver-port" },
    { portId: "sender-port" }
  ];
  const entities = [
    {
      id: "sender-port",
      type: "port",
      shortName: "SpeedOut",
      details: { communicationSpecs: [
        { dataElement: "/Interfaces/Signals/Speed", comSpecDirection: "sender" },
        { dataElement: "/Interfaces/Other/Speed", comSpecDirection: "sender" },
        { dataElement: "/Interfaces/Other/Unknown", comSpecDirection: "sender" }
      ] }
    },
    {
      id: "receiver-port",
      type: "port",
      shortName: "SpeedIn",
      details: { communicationSpecs: [
        { dataElement: "/Interfaces/Signals/Speed", comSpecDirection: "receiver" }
      ] }
    }
  ];

  assert.deepEqual(buildMemberComSpecDescriptions(members, instances, entities), {
    "/Interfaces/Signals/Speed": [
      "Sender ComSpec · SpeedOut",
      "Receiver ComSpec · SpeedIn"
    ]
  });
});
