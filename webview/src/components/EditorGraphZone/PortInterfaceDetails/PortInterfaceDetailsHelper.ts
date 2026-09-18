import type { AutosarEntity, EntityDetailPayload, InterfaceDetailMember } from "../../../../../src/shared/contracts";
import { compareTableText } from "../SwcDetails/TableData/TableData";
import { formatCalibrationAccess, formatInitValueTypeOption } from "../SwcDetails/DetailsFormatters";

export function buildPortInterfaceDetailTables(
  entity: AutosarEntity,
  members: InterfaceDetailMember[]
): EntityDetailPayload["tables"] {
  const metadata = (member: InterfaceDetailMember) => member.metadata ?? {};
  if (entity.interfaceKind === "sender-receiver") {
    return [];
  }
  if (entity.interfaceKind === "client-server") {
    const applicationErrors = members
      .filter((member) => member.kind === "applicationError")
      .map((member) => ({
        name: member.label,
        code: metadata(member)["ERROR-CODE"] ?? "-"
      }))
      .sort((left, right) => compareAutosarErrorCodes(left.code, right.code) || compareTableText(left.name, right.name));
    return [
      {
        title: "Application Errors",
        columns: [{ key: "code", label: "Error Code" }, { key: "name", label: "Error" }],
        rows: applicationErrors
      }
    ];
  }

  if (entity.interfaceKind === "mode-switch") {
    return [{
      title: "Mode Groups",
      columns: [{ key: "name", label: "Name" }, { key: "type", label: "Mode Declaration Group" }],
      rows: members.filter((member) => member.kind === "modeGroup").map((member) => ({
        name: member.label, type: metadata(member).TYPE ?? "-"
      }))
    }];
  }

  if (entity.interfaceKind === "trigger") {
    return [{
      title: "Triggers",
      columns: [
        { key: "name", label: "Name" }, { key: "policy", label: "Implementation Policy" },
        { key: "period", label: "Trigger Period" }
      ],
      rows: members.filter((member) => member.kind === "trigger").map((member) => ({
        name: member.label,
        policy: metadata(member)["SW-IMPL-POLICY"] ?? "-",
        period: metadata(member)["TRIGGER-PERIOD"] ?? "-"
      }))
    }];
  }

  const expectedKind = entity.interfaceKind === "parameter" ? "parameter" : entity.interfaceKind === "nv-data" ? "nvData" : "dataElement";
  return [{
    title: entity.interfaceKind === "parameter" ? "Parameters" : entity.interfaceKind === "nv-data" ? "NV Data" : "Data Elements",
    columns: [
      { key: "name", label: "Name" }, { key: "type", label: "Data Type" },
      { key: "initValue", label: "Init Value" }, { key: "initType", label: "Init Value Type" },
      { key: "calibration", label: "Measurement&Calibration" }, { key: "addressing", label: "Addressing Method" }
    ],
    rows: members.filter((member) => member.kind === expectedKind).map((member) => ({
      name: member.label,
      type: metadata(member).TYPE ?? "-",
      initValue: metadata(member)["INITIAL-VALUE"] ?? "-",
      initType: formatInitValueTypeOption(metadata(member)["INITIAL-VALUE-TYPE"] ?? "-"),
      calibration: formatCalibrationAccess(metadata(member)["SW-CALIBRATION-ACCESS"]),
      addressing: metadata(member)["SW-ADDR-METHOD-REF"] ?? "-"
    }))
  }];
}

export function compareAutosarErrorCodes(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumeric = Number.isFinite(leftNumber);
  const rightIsNumeric = Number.isFinite(rightNumber);
  if (leftIsNumeric && rightIsNumeric) return leftNumber - rightNumber;
  if (leftIsNumeric) return -1;
  if (rightIsNumeric) return 1;
  return compareTableText(left, right);
}
