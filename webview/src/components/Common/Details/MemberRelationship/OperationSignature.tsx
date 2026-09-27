import type { AutosarEntity, InterfaceDetailMember } from "../../../../../../src/shared/contracts";
import { formatReferenceShortName } from "../DetailsFormatters";
import "./OperationSignature.css";

/** Present a client-server operation as a function signature, without following type internals. */
export function OperationSignature(props: {
  operation: InterfaceDetailMember;
  entities?: AutosarEntity[];
  onOpenReferencedEntity?: (referencePath: string) => void;
  canOpenReferencedEntity?: (referencePath: string) => boolean;
}) {
  const argumentsList = props.operation.operationArguments ?? [];
  const entitiesByPath = new Map(
    (props.entities ?? [])
      .filter((entity) => entity.semanticPath)
      .map((entity) => [entity.semanticPath as string, entity])
  );

  function renderDataType(referencePath: string | undefined) {
    const typePath = referencePath && referencePath !== "-" ? referencePath : "-";
    const entity = entitiesByPath.get(typePath);
    const canOpen = Boolean(
      props.onOpenReferencedEntity &&
      typePath !== "-" &&
      (entity || props.canOpenReferencedEntity?.(typePath))
    );
    const typeName = formatReferenceShortName(typePath);

    if (canOpen) {
      return (
        <button
          type="button"
          className="model-operation-signature-type"
          title={`Open data type: ${typePath}`}
          onClick={() => props.onOpenReferencedEntity?.(entity?.id ?? typePath)}
        >
          {typeName}
        </button>
      );
    }

    return <span className="model-operation-signature-type" title={typePath}>{typeName}</span>;
  }

  function getDirection(direction: string | undefined) {
    const normalized = direction?.trim().toUpperCase().replace(/[\s_-]/g, "");
    if (normalized === "IN") {
      return { label: "→ IN", kind: "in" };
    }
    if (normalized === "OUT") {
      return { label: "← OUT", kind: "out" };
    }
    if (normalized === "INOUT") {
      return { label: "↔ IN/OUT", kind: "inout" };
    }
    return { label: "?", kind: "unknown" };
  }

  return (
    <div className="model-operation-signature" aria-label={`${props.operation.label} operation signature`}>
      <div className="model-operation-signature-line">
        <strong>{props.operation.label}</strong>
        <span>{argumentsList.length === 0 ? "()" : "("}</span>
      </div>
      {argumentsList.length > 0 && (
        <>
          <div className="model-operation-signature-arguments">
            {argumentsList.map((argument, index) => {
              const direction = getDirection(argument.direction);
              const serverPolicy = argument.serverPolicy && argument.serverPolicy !== "-"
                ? `Server argument implementation policy: ${argument.serverPolicy}`
                : undefined;
              return (
                <div
                  className="model-operation-signature-line model-operation-signature-argument"
                  key={`${argument.name ?? "argument"}:${index}`}
                  title={serverPolicy}
                >
                  <span className={`model-operation-signature-direction is-${direction.kind}`} title={argument.direction}>
                    {direction.label}
                  </span>
                  {renderDataType(argument.type)}
                  <span>{argument.name ?? "argument"}{index < argumentsList.length - 1 ? "," : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="model-operation-signature-line">)</div>
        </>
      )}
    </div>
  );
}
