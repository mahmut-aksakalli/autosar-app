import type { PortDirection, PortInterfaceKind } from "../../../../src/shared/contracts";

/** The AUTOSAR port glyph shared by graph handles and detail hierarchies. */
export function PortSymbol(props: {
  direction: PortDirection;
  interfaceKind?: PortInterfaceKind;
  className?: string;
}) {
  if (props.interfaceKind === "nv-data") {
    return (
      <svg className={props.className} viewBox="0 0 32 24" aria-hidden="true">
        <ellipse cx="16" cy="6" rx="9" ry="3.5" />
        <path d="M7 6V18" />
        <path d="M25 6V18" />
        <path d="M7 12C7 13.9 11 15.5 16 15.5C21 15.5 25 13.9 25 12" />
        <path d="M7 18C7 19.9 11 21.5 16 21.5C21 21.5 25 19.9 25 18" />
      </svg>
    );
  }

  if (props.interfaceKind === "parameter") {
    return (
      <svg className={props.className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M4 6H28" />
        <path d="M4 12H28" />
        <path d="M4 18H28" />
        <circle cx="11" cy="6" r="2.5" />
        <circle cx="21" cy="12" r="2.5" />
        <circle cx="15" cy="18" r="2.5" />
      </svg>
    );
  }

  if (props.interfaceKind === "mode-switch") {
    return (
      <svg className={props.className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M9 4V20" />
        <path d="M23 4V20" />
        <path d="M9 7H18L14 3" />
        <path d="M23 17H14L18 21" />
      </svg>
    );
  }

  if (props.interfaceKind === "trigger") {
    return (
      <svg className={props.className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M18 2L8 13H15L13 22L24 10H17L18 2Z" />
      </svg>
    );
  }

  if (props.direction === "provided-required") {
    return (
      <svg className={props.className} viewBox="0 0 32 24" aria-hidden="true">
        <path d="M2 12H30" />
        <path d="M10 4L2 12L10 20" />
        <path d="M22 4L30 12L22 20" />
      </svg>
    );
  }

  if (props.interfaceKind === "client-server" && props.direction === "provided") {
    return (
      <svg className={props.className} viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="9.5" />
      </svg>
    );
  }

  if (props.interfaceKind === "client-server" && props.direction === "required") {
    return (
      <svg className={props.className} viewBox="0 0 28 28" aria-hidden="true">
        <path d="M10.25 5.75A9.25 9.25 0 1 1 10.25 22.25" />
      </svg>
    );
  }

  return (
    <svg className={props.className} viewBox="0 0 28 22" aria-hidden="true">
      <path d="M3 2L22 11L3 20Z" />
    </svg>
  );
}
