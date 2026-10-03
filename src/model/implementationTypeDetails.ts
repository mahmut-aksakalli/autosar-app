import type { ImplementationTypeDetail, ImplementationTypeElementDetail } from "../shared/contracts";

function records(value: unknown): Record<string, unknown>[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((entry): entry is Record<string, unknown> =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry));
}

function valueOf(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return records(value).map((entry) => valueOf(entry["#text"]))
    .find((value) => value !== undefined);
}

function directReference(record: Record<string, unknown>, key: string): string | undefined {
  const value = valueOf(record[key]);
  return value?.startsWith("/") ? value : undefined;
}

function subElements(record: Record<string, unknown>) {
  return records(record["SUB-ELEMENTS"])
    .flatMap((container) => records(container["IMPLEMENTATION-DATA-TYPE-ELEMENT"]));
}

function ownProperties(record: Record<string, unknown>) {
  return records(record["SW-DATA-DEF-PROPS"]).flatMap((props) => [
    ...records(props["SW-DATA-DEF-PROPS-VARIANTS"])
      .flatMap((variants) => records(variants["SW-DATA-DEF-PROPS-CONDITIONAL"])),
    ...records(props["SW-DATA-DEF-PROPS-CONDITIONAL"]),
    props
  ]);
}

function references(record: Record<string, unknown>) {
  const keys: Array<[string, string]> = [
    ["Implementation Data Type", "IMPLEMENTATION-DATA-TYPE-REF"],
    ["Base Type", "BASE-TYPE-REF"],
    ["Function Signature", "FUNCTION-POINTER-SIGNATURE-REF"],
    ["Function", "FUNCTION-REF"],
    ["Compu Method", "COMPU-METHOD-REF"],
    ["Data Constraint", "DATA-CONSTR-REF"],
    ["Unit", "UNIT-REF"],
    ["Addressing Method", "SW-ADDR-METHOD-REF"]
  ];
  const props = ownProperties(record);
  const pointerProps = props.flatMap((entry) => records(entry["SW-POINTER-TARGET-PROPS"]));
  const pointerTargets = pointerProps.flatMap((entry) => [entry, ...ownProperties(entry)]);
  return keys.flatMap(([label, key]) => {
    // Only this element's properties count. Descendant references belong to
    // their own cards, not to the containing structure or array.
    const path = [...props, ...pointerTargets, record]
      .map((entry) => directReference(entry, key))
      .find((candidate) => candidate !== undefined);
    return path ? [{ label, path }] : [];
  });
}

function elementDetail(record: Record<string, unknown>): ImplementationTypeElementDetail {
  return {
    name: valueOf(record["SHORT-NAME"]) ?? "Unnamed element",
    category: valueOf(record["CATEGORY"]) ?? "UNSPECIFIED",
    references: references(record),
    arraySize: valueOf(record["ARRAY-SIZE"]),
    sizeSemantics: valueOf(record["ARRAY-SIZE-SEMANTICS"]),
    optional: valueOf(record["IS-OPTIONAL"]),
    children: subElements(record).map(elementDetail)
  };
}

/** Keep the recursive member shape so the webview can show category-specific semantics. */
export function collectImplementationTypeDetail(record: Record<string, unknown>): ImplementationTypeDetail {
  return {
    category: valueOf(record["CATEGORY"]) ?? "UNSPECIFIED",
    references: references(record),
    arraySize: valueOf(record["ARRAY-SIZE"]),
    sizeSemantics: valueOf(record["ARRAY-SIZE-SEMANTICS"]),
    elements: subElements(record).map(elementDetail)
  };
}
