import type { ReactNode } from "react";
import { formatReferenceShortName } from "../DetailsFormatters";
import { InitValueDisplay } from "../InitValueDisplay";
import { ReferenceSymbol } from "../MemberRelationship/ReferenceSymbol";
import "./DetailRelationship.css";

export interface DetailRelationshipNode {
  role: string;
  name: string;
  badge?: string;
  valueType?: string;
  facts?: Array<{ label: string; value: string; wide?: boolean }>;
  referencePath?: string;
  onClick?: () => void;
}

/** A compact, read-only semantic chain that stays visible while bottom tabs change. */
export function DetailRelationship(props: {
  source?: DetailRelationshipNode;
  sourceBranches?: DetailRelationshipNode[];
  sourceHeading?: string;
  sourceEmptyText?: string;
  sourceLink?: string;
  align?: "left" | "center";
  current: DetailRelationshipNode;
  targets?: DetailRelationshipNode[];
  targetLink?: string;
  compactTargets?: boolean;
  memberContent?: ReactNode;
  showDetailsLink?: boolean;
  onOpenReference?: (referencePath: string) => void;
  canOpenReference?: (referencePath: string) => boolean;
}) {
  const targets = props.targets ?? [];

  return (
    <div
      className={`model-detail-relationship${props.align === "left" ? " is-left-aligned" : ""}${props.compactTargets ? " has-compact-targets" : ""}`}
      aria-label={`${props.current.name} relationships`}
    >
      <div className="model-detail-relationship-chain">
        {props.sourceBranches && (
          <>
            <span className="model-detail-relationship-heading">{props.sourceHeading ?? "Referencing instances"}</span>
            {props.sourceBranches.length > 0 ? (
              <>
                <ul className="model-detail-relationship-branches">
                  {props.sourceBranches.map((source, index) => (
                    <li key={`${source.role}:${source.name}:${index}`}>
                      <RelationshipCard node={source} />
                    </li>
                  ))}
                </ul>
                <RelationshipLink label={props.sourceLink ?? "references"} />
              </>
            ) : (
              <span className="model-detail-relationship-empty">
                {props.sourceEmptyText ?? "No referencing instances discovered."}
              </span>
            )}
          </>
        )}
        {props.source && (
          <>
            <RelationshipCard node={props.source} />
            <RelationshipLink label={props.sourceLink ?? "contains"} />
          </>
        )}
        <RelationshipCard node={props.current} current />
        {props.memberContent && (
          <>
            <RelationshipLink label="has members" />
            <div className="model-detail-relationship-member-content">{props.memberContent}</div>
          </>
        )}
        {targets.length > 0 && (
          <>
            <RelationshipLink label={props.targetLink ?? "references"} />
            <div className="model-detail-relationship-targets">
              {targets.map((target, index) => (
                <RelationshipCard
                  key={`${target.role}:${target.referencePath ?? target.name}:${index}`}
                  node={target}
                  onOpenReference={props.onOpenReference}
                  canOpenReference={props.canOpenReference}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {props.showDetailsLink !== false && <RelationshipLink label="details" />}
    </div>
  );
}

function RelationshipCard(props: {
  node: DetailRelationshipNode;
  current?: boolean;
  onOpenReference?: (referencePath: string) => void;
  canOpenReference?: (referencePath: string) => boolean;
}) {
  const referencePath = props.node.referencePath;
  const canOpen = Boolean(
    props.node.onClick ||
    (referencePath && props.onOpenReference && props.canOpenReference?.(referencePath))
  );
  const open = props.node.onClick ?? (referencePath && props.onOpenReference
    ? () => props.onOpenReference?.(referencePath)
    : undefined);

  return (
    <div className={`model-detail-relationship-card${props.current ? " is-current" : ""}${props.node.facts?.length ? " has-facts" : ""}`} title={referencePath ?? (props.node.name || props.node.role)}>
      <ReferenceSymbol role={props.node.role} />
      <span className="model-detail-relationship-card-content">
        <span className="model-detail-relationship-card-role">
          <small>{props.node.role}</small>
          {props.node.badge && <span className="model-detail-relationship-card-badge">{props.node.badge}</span>}
        </span>
        {canOpen ? (
          <button type="button" onClick={open} title={`Open ${props.node.name}`}>
            {props.node.name}
          </button>
        ) : props.node.valueType ? (
          <strong><InitValueDisplay value={props.node.name} type={props.node.valueType} /></strong>
        ) : props.node.name ? (
          <strong>{props.node.name}</strong>
        ) : null}
        {props.node.facts && (
          <span className="model-detail-relationship-facts">
            {props.node.facts.map((fact) => (
              <span className={`model-detail-relationship-fact${fact.wide ? " is-wide" : ""}`} key={fact.label}>
                <small>{fact.label}</small>
                <strong title={fact.value}>{fact.value}</strong>
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

function RelationshipLink(props: { label: string }) {
  return (
    <div className="model-detail-relationship-link" aria-hidden="true">
      <span>{props.label}</span>
    </div>
  );
}

/** Turn a stored AUTOSAR reference into a card only when it has a usable target. */
export function referenceRelationship(role: string, path: string | undefined): DetailRelationshipNode | undefined {
  if (!path || path === "-") {
    return undefined;
  }
  return { role, name: formatReferenceShortName(path), referencePath: path };
}
