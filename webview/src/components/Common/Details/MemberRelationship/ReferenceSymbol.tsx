type SymbolKind =
  | "package"
  | "swc"
  | "runnable"
  | "constant"
  | "unit"
  | "mode"
  | "variable"
  | "parameter"
  | "memory"
  | "service"
  | "port"
  | "element"
  | "operation"
  | "application"
  | "implementation"
  | "base"
  | "compu"
  | "constraint"
  | "type"
  | "reference";

function getSymbolKind(entityType: string | undefined, role: string): SymbolKind {
  // A resolved entity is more reliable than the relationship label. For an
  // external reference, the role still gives the user a meaningful symbol.
  const kind = (entityType ?? role).toLowerCase().replaceAll("-", " ");
  if (kind.includes("package")) return "package";
  if (kind.includes("software component")) return "swc";
  if (kind.includes("runnable") && !kind.includes("variable")) return "runnable";
  if (kind.includes("constant")) return "constant";
  if (kind === "unit" || kind.includes("unit properties")) return "unit";
  if (kind === "mode" || kind.includes("mode declaration")) return "mode";
  if (kind.includes("inter runnable variable")) return "variable";
  if (kind.includes("parameter")) return "parameter";
  if (kind.includes("per instance memory")) return "memory";
  if (kind.includes("service need")) return "service";
  if (kind.includes("port prototype")) return "port";
  if (kind.includes("data element")) return "element";
  if (kind.includes("operation")) return "operation";
  if (kind.includes("application data type")) return "application";
  if (kind.includes("implementation data type")) return "implementation";
  if (kind.includes("base type")) return "base";
  if (kind.includes("compu method")) return "compu";
  if (kind.includes("data constraint")) return "constraint";
  if (kind.includes("data type") || kind.includes("type")) return "type";
  return "reference";
}

/** Compact semantic glyphs for the reference chain, independent of navigation. */
export function ReferenceSymbol(props: { entityType?: string; role: string }) {
  const kind = getSymbolKind(props.entityType, props.role);
  return (
    <span className={`model-member-reference-symbol is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === "package" && <path d="M3 6h7l2 3h9v11H3z" />}
        {kind === "swc" && <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M2 9h3M2 15h3M19 9h3M19 15h3" /></>}
        {kind === "runnable" && <><circle cx="12" cy="12" r="9" /><text x="12" y="16" textAnchor="middle">R</text></>}
        {kind === "constant" && <><rect x="4" y="4" width="16" height="16" rx="3" /><text x="12" y="16" textAnchor="middle">C</text></>}
        {kind === "unit" && <><circle cx="12" cy="12" r="9" /><text x="12" y="16" textAnchor="middle">U</text></>}
        {kind === "mode" && <><circle cx="12" cy="12" r="9" /><text x="12" y="16" textAnchor="middle">M</text></>}
        {kind === "variable" && <><rect x="4" y="4" width="16" height="16" rx="3" /><text x="12" y="16" textAnchor="middle">V</text></>}
        {kind === "parameter" && <><circle cx="12" cy="12" r="9" /><text x="12" y="16" textAnchor="middle">P</text></>}
        {kind === "memory" && <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M2 8h3M2 12h3M2 16h3M19 8h3M19 12h3M19 16h3" /><text x="12" y="16" textAnchor="middle">M</text></>}
        {kind === "service" && <><path d="M12 2l9 10-9 10L3 12z" /><text x="12" y="16" textAnchor="middle">S</text></>}
        {kind === "port" && <><path d="M3 5h11l7 7-7 7H3z" /><path d="M3 9H1M3 15H1" /></>}
        {kind === "element" && <><path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7" /></>}
        {kind === "operation" && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h10M12 8v8" /></>}
        {kind === "application" && <><rect x="4" y="4" width="16" height="16" rx="3" /><text x="12" y="16" textAnchor="middle">A</text></>}
        {kind === "implementation" && <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M2 8h3M2 12h3M2 16h3M19 8h3M19 12h3M19 16h3" /><text x="12" y="16" textAnchor="middle">I</text></>}
        {kind === "base" && <><rect x="2" y="5" width="20" height="14" rx="2" /><text x="12" y="15.5" textAnchor="middle">01</text></>}
        {kind === "compu" && <><path d="M4 18h16M8 17l3-11h5M6 11h8" /><circle cx="18" cy="8" r="2" /></>}
        {kind === "constraint" && <><path d="M6 5H3v14h3M18 5h3v14h-3M8 12h8M8 9v6M16 9v6" /></>}
        {kind === "type" && <><rect x="4" y="4" width="16" height="16" rx="2" /><text x="12" y="16" textAnchor="middle">T</text></>}
        {kind === "reference" && <><circle cx="6" cy="12" r="3" /><circle cx="18" cy="12" r="3" /><path d="M9 12h6" /></>}
      </svg>
    </span>
  );
}
