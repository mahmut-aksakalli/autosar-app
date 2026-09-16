import type {
  ServiceAssignedDataDetail,
  ServiceAssignedPortDetail,
  ServiceNeedField
} from "../../../../../../src/shared/contracts";
import {
  formatAssignedPortPrototypeColumn,
  formatNumber,
  formatTimeInterval,
  normalizeAutosarEnumToken
} from "../DetailsFormatters";

type ServiceNeedDetailField = {
  tag?: string;
  label: string;
  value: string;
  kind: "checkbox" | "dropdown";
  checked: boolean;
};

export type ServiceNeedDisplayDetail = {
  label: string;
  value: string;
  kind: "checkbox" | "checkboxDropdown" | "dropdown" | "number" | "text";
  checked?: boolean;
  options?: string[];
};

export interface NvmAssignedDataDetail {
  role: "ramBlock" | "defaultValue";
  value: string;
}

const nvBlockNeedsDetailOrder: Array<{
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
}> = [
  { label: "Name", kind: "text" },
  { label: "Service Need", kind: "text" },
  { label: "Category", kind: "text" },
  { label: "Ram Block Status Control", tag: "RAM-BLOCK-STATUS-CONTROL", kind: "dropdown" },
  { label: "Reliability", tag: "RELIABILITY", kind: "dropdown" },
  { label: "Writing Priority", tag: "WRITING-PRIORITY", kind: "dropdown" },
  { label: "Number of Datasets", tag: "N-DATA-SETS", aliases: ["N Data Sets"], kind: "number", defaultValue: "0" },
  { label: "Number of ROM Block", tag: "N-ROM-BLOCKS", aliases: ["N Rom Blocks"], kind: "number", defaultValue: "0" },
  { label: "Calc Ram Block Crc", tag: "CALC-RAM-BLOCK-CRC", kind: "checkbox", defaultValue: "false" },
  { label: "Readonly", tag: "READONLY", kind: "checkbox", defaultValue: "false" },
  {
    label: "Resistant To Changed Sw",
    tag: "RESISTANT-TO-CHANGED-SW",
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Restore At Start", tag: "RESTORE-AT-START", kind: "checkbox", defaultValue: "false" },
  { label: "Store At Shutdown", tag: "STORE-AT-SHUTDOWN", kind: "checkbox", defaultValue: "false" },
  { label: "Use Crc Comp Mechanism", tag: "USE-CRC-COMP-MECHANISM", kind: "checkbox", defaultValue: "false" },
  { label: "Check Static Block ID", tag: "CHECK-STATIC-BLOCK-ID", kind: "checkbox", defaultValue: "false" },
  { label: "Write Verification", tag: "WRITE-VERIFICATION", kind: "checkbox", defaultValue: "false" },
  { label: "Write only once", tag: "WRITE-ONLY-ONCE", kind: "checkbox", defaultValue: "false" },
  {
    label: "Use Auto Validation at Shutdown",
    tag: "USE-AUTO-VALIDATION-AT-SHUT-DOWN",
    aliases: ["Use Auto Validation At Shut Down"],
    kind: "checkbox",
    defaultValue: "false"
  },
  { label: "Store Emergency", tag: "STORE-EMERGENCY", kind: "checkbox", defaultValue: "false" },
  { label: "Store Immediate", tag: "STORE-IMMEDIATE", kind: "checkbox", defaultValue: "false" },
  { label: "Store Cyclic", tag: "STORE-CYCLIC", kind: "checkbox", defaultValue: "false" },
  { label: "Cyclic Writing Period", tag: "CYCLIC-WRITING-PERIOD", kind: "number", defaultValue: "0 sec" }
];

type ServiceNeedDetailDefinition = {
  label: string;
  tag?: string;
  aliases?: string[];
  kind: ServiceNeedDisplayDetail["kind"];
  defaultValue?: string;
  options?: string[];
  formatter?: (value: string) => string;
};

const serviceNeedDetailOrders: Record<string, ServiceNeedDetailDefinition[]> = {
  bswmgrneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  commgruserneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Max Comm Mode", tag: "MAX-COMM-MODE", kind: "dropdown" },
    { label: "Represented Port Group", tag: "REPRESENTED-PORT-GROUP", kind: "dropdown" },
    { label: "Port Assignment", kind: "text" }
  ],
  cryptoserviceneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    {
      label: "Max Key Length",
      tag: "MAX-KEY-LENGTH",
      kind: "number",
      defaultValue: "0 bytes",
      formatter: formatBytesValue
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticcommunicationmanagerneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    {
      label: "Service Request Callback Type",
      tag: "SERVICE-REQUEST-CALLBACK-TYPE",
      kind: "checkboxDropdown",
      options: ["Manufacturer", "Supplier"]
    },
    { label: "Port Assignment", kind: "text" }
  ],
  diagnosticenableconditionneeds: [
    { label: "Name", kind: "text" },
    { label: "Service Need", kind: "text" },
    { label: "Security Access Level", tag: "SECURITY-ACCESS-LEVEL", kind: "number", defaultValue: "0" },
    { label: "DID Number", tag: "DID-NUMBER", aliases: ["Did Number"], kind: "number", defaultValue: "0" },
    {
      label: "Processing Style",
      tag: "PROCESSING-STYLE",
      kind: "checkboxDropdown",
      options: ["Asynch", "Synch", "Asynch with Error"]
    },
    { label: "Port Assignment", kind: "text" },
    { label: "Fixed Length", tag: "FIXED-LENGTH", kind: "checkbox", defaultValue: "false" }
  ]
};

function getGenericServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  const rows: ServiceNeedDisplayDetail[] = [
    { label: "Name", value: itemLabel ?? "-", kind: "text" },
    { label: "Service Need", value: metadata["SERVICE-NEED"] ?? "-", kind: "text" },
    { label: "Category", value: metadata.CATEGORY ?? "-", kind: "text" }
  ];

  if (details.length === 0) {
    return [...rows, { label: "Service Need Details", value: "-", kind: "text" }];
  }

  return [
    ...rows,
    ...details.map((detail) => ({
      label: detail.label,
      value: detail.value,
      kind: detail.kind,
      checked: detail.checked
    }))
  ];
}

export function getServiceNeedDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[],
  assignedPorts: ServiceAssignedPortDetail[]
): ServiceNeedDisplayDetail[] {
  const serviceType = normalizeAutosarEnumToken(metadata["SERVICE-TYPE"] ?? "");
  if (serviceType === "nvblockneeds") {
    return getNvBlockNeedsDetailRows(itemLabel, metadata, details);
  }

  const definitions = serviceNeedDetailOrders[serviceType];
  if (!definitions) {
    return getGenericServiceNeedDetailRows(itemLabel, metadata, details);
  }

  return definitions.map((definition) =>
    buildServiceNeedDetailRow(definition, itemLabel, metadata, details, assignedPorts)
  );
}

function buildServiceNeedDetailRow(
  definition: ServiceNeedDetailDefinition,
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[],
  assignedPorts: ServiceAssignedPortDetail[]
): ServiceNeedDisplayDetail {
  if (definition.label === "Name") {
    return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
  }
  if (definition.label === "Service Need") {
    return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
  }
  if (definition.label === "Category") {
    return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
  }
  if (definition.label === "Port Assignment") {
    return {
      label: definition.label,
      value: formatAssignedPortPrototypeColumn(assignedPorts, metadata["ASSIGNED-PORTS"]),
      kind: definition.kind
    };
  }

  const detail = findServiceNeedDetail(details, definition);
  const rawValue = detail?.value;
  const fallback = definition.defaultValue ?? "-";
  const value = definition.formatter ? definition.formatter(rawValue ?? fallback) : rawValue || fallback;
  const checked =
    definition.kind === "checkbox"
      ? readBinaryServiceNeedDetailValue(value) === true
      : definition.kind === "checkboxDropdown"
        ? value !== "-" && readBinaryServiceNeedDetailValue(value) !== false
        : undefined;
  return {
    label: definition.label,
    value: definition.options ? normalizeServiceNeedOption(value, definition.options) : value,
    kind: definition.kind,
    checked,
    options: definition.options
  };
}

function getNvBlockNeedsDetailRows(
  itemLabel: string | undefined,
  metadata: Record<string, string>,
  details: ServiceNeedDetailField[]
): ServiceNeedDisplayDetail[] {
  return nvBlockNeedsDetailOrder.map((definition) => {
    if (definition.label === "Name") {
      return { label: definition.label, value: itemLabel ?? "-", kind: definition.kind };
    }
    if (definition.label === "Service Need") {
      return { label: definition.label, value: metadata["SERVICE-NEED"] ?? "-", kind: definition.kind };
    }
    if (definition.label === "Category") {
      return { label: definition.label, value: metadata.CATEGORY ?? "-", kind: definition.kind };
    }

    const detail = findServiceNeedDetail(details, definition);
    const value = formatNvBlockNeedDetailValue(definition, detail?.value);
    const checked = definition.kind === "checkbox" ? readBinaryServiceNeedDetailValue(value) === true : undefined;
    return {
      label: definition.label,
      value,
      kind: definition.kind,
      checked
    };
  });
}

function findServiceNeedDetail(
  details: ServiceNeedDetailField[],
  definition: ServiceNeedDetailDefinition
) {
  const expectedKeys = [definition.tag, definition.label, ...(definition.aliases ?? [])]
    .filter((entry): entry is string => Boolean(entry))
    .map(normalizeAutosarEnumToken);
  return details.find((detail) => {
    const keys = [detail.tag, detail.label].filter((entry): entry is string => Boolean(entry)).map(normalizeAutosarEnumToken);
    return keys.some((key) => expectedKeys.includes(key));
  });
}

function formatBytesValue(value: string) {
  if (!value || value === "-") {
    return "0 bytes";
  }
  return /\bbytes?\b/i.test(value) ? value : `${value} bytes`;
}

function normalizeServiceNeedOption(value: string, options: string[]) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  return options.find((option) => normalizeAutosarEnumToken(option) === normalizedValue) ?? value;
}

export function getServiceNeedSelectOptions(value: string, options: string[] | undefined) {
  const selectOptions = options && options.length > 0 ? options : [value];
  return selectOptions.includes(value) ? selectOptions : [value, ...selectOptions];
}

function formatNvBlockNeedDetailValue(
  definition: (typeof nvBlockNeedsDetailOrder)[number],
  value: string | undefined
) {
  const fallback = definition.defaultValue ?? "-";
  if (!value || value === "-") {
    return fallback;
  }

  if (definition.tag === "CYCLIC-WRITING-PERIOD") {
    return formatNvBlockCyclicWritingPeriod(value);
  }

  return value;
}

function formatNvBlockCyclicWritingPeriod(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }
  if (numericValue === 0) {
    return "0 sec";
  }
  if (Math.abs(numericValue) >= 1000 && Number.isInteger(numericValue) && numericValue % 1000 === 0) {
    return `${formatNumber(numericValue / 1000)} sec`;
  }
  if (Math.abs(numericValue) >= 1) {
    return `${formatNumber(numericValue)} msec`;
  }
  return formatTimeInterval(value);
}

export function parseNvmAssignedDataDetails(
  metadata: Record<string, string>,
  assignedData: ServiceAssignedDataDetail[]
): NvmAssignedDataDetail[] {
  return [
    {
      role: "ramBlock",
      value: findAssignedDataValue(assignedData, "ramblock") ?? metadata["ASSIGNED-DATA-RAM-BLOCK"] ?? "-"
    },
    {
      role: "defaultValue",
      value: findAssignedDataValue(assignedData, "defaultvalue") ?? metadata["ASSIGNED-DATA-DEFAULT-VALUE"] ?? "-"
    }
  ];
}

function findAssignedDataValue(assignments: ServiceAssignedDataDetail[], normalizedRole: string) {
  return assignments.find((assignment) => normalizeAutosarEnumToken(assignment.assignedRole) === normalizedRole)?.value;
}

export function parseServiceNeedDetailFields(
  structuredFields: ServiceNeedField[],
  fallbackSummary: string | undefined
): ServiceNeedDetailField[] {
  const fields: Array<{ tag?: string; label: string; value: string }> =
    structuredFields.length > 0
      ? structuredFields
      : parseServiceNeedDetailSummary(fallbackSummary).map((detail) => ({
          label: detail.label,
          value: detail.value
        }));

  return fields.map((detail) => {
    const checked = readBinaryServiceNeedDetailValue(detail.value);
    return {
      tag: detail.tag,
      label: detail.label,
      value: detail.value,
      kind: checked === undefined ? "dropdown" : "checkbox",
      checked: checked === true
    };
  });
}

function parseServiceNeedDetailSummary(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value.split(/,\s+(?=[A-Z][A-Za-z0-9 ]+:\s*)/).flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      return [];
    }
    const label = entry.slice(0, separatorIndex).trim();
    const detailValue = entry.slice(separatorIndex + 1).trim();
    return label && detailValue ? [{ label, value: detailValue }] : [];
  });
}

function readBinaryServiceNeedDetailValue(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return undefined;
}
