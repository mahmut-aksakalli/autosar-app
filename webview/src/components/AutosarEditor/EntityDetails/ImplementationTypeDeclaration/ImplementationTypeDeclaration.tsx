import type { ImplementationTypeDetail, ImplementationTypeElementDetail } from "../../../../../../src/shared/contracts";
import { formatReferenceShortName } from "../../../Common/Details/DetailsFormatters";
import "./ImplementationTypeDeclaration.css";

type TypePart = Pick<ImplementationTypeElementDetail, "category" | "references" | "arraySize" | "sizeSemantics" | "children"> & {
  optional?: string;
};

interface DeclarationProps {
  name: string;
  detail: ImplementationTypeDetail;
  onOpenReference?: (path: string) => void;
  canOpenReference?: (path: string) => boolean;
}

function primaryType(part: TypePart) {
  return part.references.find((reference) => reference.label === "Implementation Data Type")
    ?? part.references.find((reference) => reference.label === "Base Type");
}

function primaryText(part: TypePart) {
  const reference = primaryType(part);
  return reference ? formatReferenceShortName(reference.path) : "unknown_type";
}

function arraySuffix(part: TypePart) {
  return part.arraySize ? `[${part.arraySize}]` : "";
}

function isOptional(part: TypePart) {
  return part.optional?.trim().toLowerCase() === "true";
}

function categoryBadge(category: string) {
  switch (category) {
    case "STRUCTURE": return "Structure";
    case "UNION": return "Union";
    case "ARRAY": return "Array";
    default: return category.replaceAll("_", " ");
  }
}

/** A readable type sketch, deliberately not a C declaration. */
export function ImplementationTypeDeclaration(props: DeclarationProps) {
  function renderType(part: TypePart) {
    const reference = primaryType(part);
    if (!reference) {
      return <span className="model-type-declaration-missing">unknown_type</span>;
    }
    const canOpen = Boolean(props.onOpenReference && props.canOpenReference?.(reference.path));
    if (canOpen) {
      return (
        <button type="button" title={reference.path} onClick={() => props.onOpenReference?.(reference.path)}>
          {primaryText(part)}
        </button>
      );
    }
    return <span title={reference.path}>{primaryText(part)}</span>;
  }

  function renderAnnotations(part: TypePart, level: number, key: string) {
    const primary = primaryType(part);
    // The root type no longer has a separate General property panel. Keep all
    // of its own references reachable below the declaration.
    const extraReferences = level === 0
      ? part.references
      : part.references.filter((reference) => reference !== primary);
    if (!part.sizeSemantics && extraReferences.length === 0) {
      return null;
    }
    return (
      <div className="model-type-declaration-annotations" style={{ paddingLeft: `${level * 4}ch` }} key={`${key}:annotations`}>
        {part.sizeSemantics && <span>Size semantics: {part.sizeSemantics}</span>}
        {extraReferences.map((reference) => (
          <span key={`${reference.label}:${reference.path}`}>
            {reference.label}: <ReferenceLink reference={reference} {...props} />
          </span>
        ))}
      </div>
    );
  }

  function renderGroup(part: TypePart, name: string, level: number, key: string) {
    const category = part.category.toUpperCase();
    return (
      <div key={key} className="model-type-declaration-group">
        <div className="model-type-declaration-line" style={{ paddingLeft: `${level * 4}ch` }}>
          <span className={`model-type-declaration-category is-${category.toLowerCase()}`}>{categoryBadge(category)}</span>
          <strong>{name}{category === "ARRAY" ? arraySuffix(part) : ""}</strong>
          <span>{" {"}</span>
          {isOptional(part) && <span className="model-type-declaration-optional">Optional</span>}
        </div>
        {part.children.length > 0 ? part.children.map((child, index) =>
          renderPart(child, child.name, level + 1, `${key}.${index}`)) : (
          <div className="model-type-declaration-comment" style={{ paddingLeft: `${(level + 1) * 4}ch` }}>
            No members defined
          </div>
        )}
        <div className="model-type-declaration-line" style={{ paddingLeft: `${level * 4}ch` }}>{"};"}</div>
        {renderAnnotations(part, level, key)}
      </div>
    );
  }

  function renderPart(part: TypePart, name: string, level: number, key: string) {
    const category = part.category.toUpperCase();
    if (category === "STRUCTURE" || category === "UNION" || category === "ARRAY" || part.children.length > 0) {
      return renderGroup(part, name, level, key);
    }
    return (
      <div key={key}>
        <div className="model-type-declaration-line" style={{ paddingLeft: `${level * 4}ch` }}>
          <span className="model-type-declaration-category is-member">{categoryBadge(category)}</span>
          {renderType(part)} <strong>{name}{arraySuffix(part)}</strong>;
          {isOptional(part) && <span className="model-type-declaration-optional">Optional</span>}
        </div>
        {renderAnnotations(part, level, key)}
      </div>
    );
  }

  return (
    <div className="model-type-declaration" aria-label={`${props.name} type declaration`}>
      {renderPart({ ...props.detail, children: props.detail.elements }, props.name, 0, "root")}
    </div>
  );
}

function ReferenceLink(props: DeclarationProps & { reference: { label: string; path: string } }) {
  const canOpen = Boolean(props.onOpenReference && props.canOpenReference?.(props.reference.path));
  if (canOpen) {
    return (
      <button type="button" title={props.reference.path} onClick={() => props.onOpenReference?.(props.reference.path)}>
        {formatReferenceShortName(props.reference.path)}
      </button>
    );
  }
  return <span title={props.reference.path}>{formatReferenceShortName(props.reference.path)}</span>;
}
