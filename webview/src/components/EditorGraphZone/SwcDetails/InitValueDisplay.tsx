import { useState } from "react";
import { normalizeAutosarEnumToken } from "./DetailsFormatters";

const INIT_VALUE_PREVIEW_LENGTH = 100;

export function InitValueDisplay(props: { value: string; type: string }) {
  const { value, type } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = shouldTruncateInitValue(value, type);
  const displayValue = formatInitValueDisplay(value, type, isExpanded);
  const isMultiline = displayValue.includes("\n");

  return (
    <span className="model-init-value-display" title={value}>
      <span className={isMultiline ? "model-init-value-text is-multiline" : "model-init-value-text"}>
        {displayValue}
      </span>
      {canExpand && (
        <button
          type="button"
          className="model-init-value-toggle"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}

function formatInitValueDisplay(value: string, type: string, expanded = false) {
  if (expanded) {
    return formatStructuredInitValue(value, type);
  }

  if (!shouldTruncateInitValue(value, type)) {
    return formatStructuredInitValue(value, type);
  }

  return `${value.slice(0, INIT_VALUE_PREVIEW_LENGTH)}...`;
}

function shouldTruncateInitValue(value: string, type: string) {
  const normalizedType = normalizeAutosarEnumToken(type);
  const shouldTruncate =
    normalizedType.includes("constant") ||
    normalizedType.includes("array") ||
    normalizedType.includes("record");

  return shouldTruncate && value.length > INIT_VALUE_PREVIEW_LENGTH;
}

function formatStructuredInitValue(value: string, type: string) {
  const normalizedType = normalizeAutosarEnumToken(type);
  const shouldFormat = normalizedType.includes("array") || normalizedType.includes("record");
  if (!shouldFormat || value === "-" || value.length === 0) {
    return value;
  }

  return prettyPrintCompositeValue(value);
}

function prettyPrintCompositeValue(value: string) {
  let depth = 0;
  let result = "";
  let pendingSpace = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "{" || char === "[") {
      result = trimTrailingSpaces(result);
      if (result.endsWith(":")) {
        result += " ";
      }
      result += char;
      depth += 1;
      result += `\n${"  ".repeat(depth)}`;
      pendingSpace = false;
      continue;
    }
    if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      result = trimTrailingSpaces(result);
      result += `\n${"  ".repeat(depth)}${char}`;
      pendingSpace = false;
      continue;
    }
    if (char === ",") {
      result = trimTrailingSpaces(result) + ",";
      result += `\n${"  ".repeat(depth)}`;
      pendingSpace = false;
      continue;
    }
    if (/\s/.test(char)) {
      pendingSpace = result.length > 0 && !result.endsWith("\n");
      continue;
    }

    if (pendingSpace) {
      result += " ";
      pendingSpace = false;
    }
    result += char;
  }

  return trimTrailingSpaces(result);
}

function trimTrailingSpaces(value: string) {
  return value.replace(/[ \t]+$/g, "");
}
