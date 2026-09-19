import { formatReferenceShortName } from "./DetailsFormatters";

export function ReferenceValue(props: {
  referencePath?: string;
  onOpen?: (referencePath: string) => void;
  canOpen?: (referencePath: string) => boolean;
}) {
  const referencePath = props.referencePath ?? "-";

  return (
    <strong className="model-reference-value">
      <span className="model-reference-value-text">
        {formatReferenceShortName(referencePath)}
      </span>
      <ReferenceOpenButton
        referencePath={referencePath}
        onOpen={props.onOpen}
        canOpen={props.canOpen}
      />
    </strong>
  );
}

export function ReferenceOpenButton(props: {
  referencePath?: string;
  onOpen?: (referencePath: string) => void;
  canOpen?: (referencePath: string) => boolean;
}) {
  const referencePath = props.referencePath ?? "-";
  const referenceExists = props.canOpen?.(referencePath) === true;
  if (referencePath === "-" || !props.onOpen || !referenceExists) {
    return null;
  }

  return (
    <button
      type="button"
      className="model-reference-open-button"
      aria-label="Open reference"
      title="Open reference"
      onClick={() => props.onOpen?.(referencePath)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 3.5h7.5V11M12.25 3.75 4 12" />
      </svg>
    </button>
  );
}
