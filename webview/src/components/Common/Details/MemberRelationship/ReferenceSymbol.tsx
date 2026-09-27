type SymbolKind =
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
  const kind = entityType ?? role.toLowerCase();
  if (kind.includes("application-data-type")) return "application";
  if (kind.includes("implementation-data-type")) return "implementation";
  if (kind.includes("base-type") || kind.includes("base type")) return "base";
  if (kind.includes("compu-method") || kind.includes("compu method")) return "compu";
  if (kind.includes("data-constraint") || kind.includes("data constraint")) return "constraint";
  if (kind.includes("data-type") || kind.includes("data type") || kind.includes("type")) return "type";
  return "reference";
}

/** Compact semantic glyphs for the reference chain, independent of navigation. */
export function ReferenceSymbol(props: { entityType?: string; role: string }) {
  const kind = getSymbolKind(props.entityType, props.role);
  return (
    <span className={`model-member-reference-symbol is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
