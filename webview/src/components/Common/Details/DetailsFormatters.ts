import type { ServiceAssignedPortDetail } from "../../../../../src/shared/contracts";

export function formatReferenceShortName(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const parts = value.split("/").filter(Boolean);
  return parts.at(-1) ?? value;
}

export function formatAutosarTagText(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return value
    .toLowerCase()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCalibrationAccess(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const normalized = value.trim().toUpperCase().replace(/[_\s]+/g, "-");
  if (normalized === "READ-WRITE" || normalized === "READWRITE") {
    return "ReadWrite";
  }
  if (normalized === "READ-ONLY" || normalized === "READONLY") {
    return "ReadOnly";
  }
  if (
    normalized === "NOT-ACCESSIBLE" ||
    normalized === "NOTACCESSIBLE" ||
    normalized === "NOT-ACCESSIBLE-NO-AUTOSAR" ||
    normalized === "NOTACCESSIBLENOAUTOSAR"
  ) {
    return "NotAccessible";
  }
  return value;
}

export function formatParameterScopeOption(value: string | undefined): string {
  const normalized = normalizeAutosarEnumToken(value ?? "");
  if (!normalized) {
    return "-";
  }
  if (normalized.includes("perinstance")) {
    return "Per Instance";
  }
  if (normalized.includes("shared")) {
    return "Shared";
  }
  return "-";
}

export function formatInterRunnableCommunicationOption(value: string | undefined): string {
  const normalized = normalizeAutosarEnumToken(value ?? "");
  if (normalized.includes("explicit")) {
    return "Explicit";
  }
  if (normalized.includes("implicit")) {
    return "Implicit";
  }
  return "-";
}

export function stringifyAccessPointCell(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

export function formatMeasurementCalibrationOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "notaccessible" || normalized === "none" || normalized === "false") {
    return "Not Accessible";
  }

  if (normalized === "readwrite" || (normalized.includes("read") && normalized.includes("write"))) {
    return "ReadWrite";
  }
  if (normalized === "write" || normalized === "writeonly") {
    return "Write";
  }
  return "Read";
}

export function formatHandleInvalidOption(value: string) {
  const normalizedValue = normalizeAutosarEnumToken(value);
  if (!normalizedValue || normalizedValue === "none" || normalizedValue === "false" || normalizedValue === "noaction") {
    return "None";
  }
  if (normalizedValue.startsWith("replace")) {
    return "Replace";
  }
  if (normalizedValue.startsWith("keep")) {
    return "Keep";
  }
  return "None";
}

export const initValueTypeOptions = [
  "None",
  "Numerical",
  "Textual",
  "Boolean",
  "Constant Reference",
  "Array",
  "Record",
  "Application Value",
  "Not Available"
];

export function formatInitValueTypeOption(value: string) {
  const normalized = normalizeAutosarEnumToken(value);
  if (!normalized || normalized === "none" || normalized === "notset") {
    return "None";
  }
  if (normalized.includes("numerical")) {
    return "Numerical";
  }
  if (normalized.includes("text")) {
    return "Textual";
  }
  if (normalized.includes("boolean")) {
    return "Boolean";
  }
  if (normalized.includes("constant")) {
    return "Constant Reference";
  }
  if (normalized.includes("array")) {
    return "Array";
  }
  if (normalized.includes("record")) {
    return "Record";
  }
  if (normalized.includes("application")) {
    return "Application Value";
  }
  if (normalized.includes("notavailable")) {
    return "Not Available";
  }
  return "None";
}

export function normalizeAutosarEnumToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function readBooleanMetadata(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
}

export function formatBooleanMetadata(value: string | undefined) {
  return readBooleanMetadata(value) === true ? "true" : "false";
}

export function readEnabledMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "-" && normalized !== "false" && normalized !== "none" && normalized !== "no";
}

export function readTransformationErrorHandlingMetadata(value: string | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "-" &&
    normalized !== "false" &&
    normalized !== "none" &&
    normalized !== "no" &&
    normalized !== "no-transformer-error-handling"
  );
}

export function splitMetadataList(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export function formatTimeInterval(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  if (seconds === 0 || Math.abs(seconds) >= 1) {
    return `${formatNumber(seconds)} sec`;
  }

  const milliseconds = seconds * 1000;
  if (Math.abs(milliseconds) >= 1) {
    return `${formatNumber(milliseconds)} msec`;
  }

  return `${formatNumber(seconds * 1_000_000)} usec`;
}

export function formatOptionalMilliseconds(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  return `${formatNumber(seconds * 1000)} ms`;
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}


export function formatAssignedPortPrototypeColumn(
  details: ServiceAssignedPortDetail[],
  fallbackSummary: string | undefined
) {
  if (details.length > 0) {
    return details.map((detail) => detail.portPrototype).filter((value) => value !== "-").join(", ") || "-";
  }

  if (!fallbackSummary) {
    return "-";
  }

  const ports = fallbackSummary.split(",").flatMap((entry) => {
    const separatorIndex = entry.indexOf(":");
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
    return value ? [value] : [];
  });
  return ports.length > 0 ? ports.join(", ") : "-";
}
