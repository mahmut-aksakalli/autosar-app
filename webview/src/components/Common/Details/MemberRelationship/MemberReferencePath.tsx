import type { AutosarEntity } from "../../../../../../src/shared/contracts";
import { formatReferenceShortName } from "../DetailsFormatters";
import { ReferenceSymbol } from "./ReferenceSymbol";

interface ReferenceNode {
  label: string;
  path: string;
  targetEntityId?: string;
  targetEntityType?: string;
  children: ReferenceNode[];
}

function isReference(value: string | undefined): value is string {
  return Boolean(value && value !== "-");
}

function makeReferenceNode(
  label: string,
  path: string,
  entitiesByPath: Map<string, AutosarEntity>
): ReferenceNode {
  const entity = entitiesByPath.get(path);
  return { label, path, targetEntityId: entity?.id, targetEntityType: entity?.type, children: [] };
}

/** Show the member type and only its immediate base, conversion, and constraint references. */
export function MemberReferencePath(props: {
  dataType?: string;
  dataConstraints?: string;
  entities?: AutosarEntity[];
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const entitiesByPath = new Map(
    (props.entities ?? [])
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath as string, entity])
  );
  const roots: ReferenceNode[] = [];
  if (isReference(props.dataType)) {
    const typeNode = makeReferenceNode("Data Type", props.dataType, entitiesByPath);
    const typeEntity = entitiesByPath.get(props.dataType);
    if (typeEntity?.type === "application-data-type" || typeEntity?.type === "implementation-data-type") {
      const fields = typeEntity.details?.entity?.fields ?? [];
      typeNode.children = fields
        .filter((field) => ["Base Type", "Compu Method", "Data Constraint"].includes(field.label) && isReference(field.value))
        .map((field) => makeReferenceNode(field.label, field.value, entitiesByPath));
    }
    roots.push(typeNode);
  }
  if (isReference(props.dataConstraints)) {
    roots.push(makeReferenceNode("Data Constraint", props.dataConstraints, entitiesByPath));
  }

  if (roots.length === 0) {
    return null;
  }

  return (
    <div className="model-member-reference-path">
      <ReferenceBranches
        nodes={roots}
        onOpen={props.onOpenReferencedEntity}
        canOpen={props.canOpenReferencedEntity}
      />
    </div>
  );
}

function ReferenceBranches(props: {
  nodes: ReferenceNode[];
  onOpen?: (referencePath: string) => void;
  canOpen?: (referencePath: string) => boolean;
}) {
  return (
    <div className="model-member-reference-branches">
      {props.nodes.map((node, index) => (
        <div className="model-member-reference-branch" key={`${node.label}:${node.path}:${index}`}>
          <ReferenceCard node={node} onOpen={props.onOpen} canOpen={props.canOpen} />
          {node.children.length > 0 && (
            <ReferenceBranches nodes={node.children} onOpen={props.onOpen} canOpen={props.canOpen} />
          )}
        </div>
      ))}
    </div>
  );
}

function ReferenceCard(props: {
  node: ReferenceNode;
  onOpen?: (referencePath: string) => void;
  canOpen?: (referencePath: string) => boolean;
}) {
  // An entity found while building the chain has a stable ID. Navigate with
  // that ID instead of requiring the displayed reference path to match again.
  const navigationTarget = props.node.targetEntityId ?? props.node.path;
  const canOpen = Boolean(
    props.onOpen && (props.node.targetEntityId || props.canOpen?.(props.node.path))
  );
  return (
    <div className="model-member-reference-card" title={props.node.path}>
      <ReferenceSymbol entityType={props.node.targetEntityType} role={props.node.label} />
      <span className="model-member-reference-card-content">
        {canOpen ? (
          <button type="button" title={`Open ${props.node.label} details`} onClick={() => props.onOpen?.(navigationTarget)}>
            {formatReferenceShortName(props.node.path)}
          </button>
        ) : (
          <strong>{formatReferenceShortName(props.node.path)}</strong>
        )}
        <small>{props.node.label}</small>
      </span>
    </div>
  );
}
