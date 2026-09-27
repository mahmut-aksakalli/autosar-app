import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EntityReferenceInstance, PortDirection, PortInterfaceKind, SwcKind } from "../../../../../../src/shared/contracts";
import { PortSymbol } from "../../PortSymbol";
import { formatSwcKindSymbol } from "../../SwcKindSymbol";
import { formatReferenceShortName } from "../DetailsFormatters";
import "./PortHierarchy.css";

function useHierarchyAnchor() {
  const layoutRef = useRef<HTMLElement>(null);
  const chainRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState({ top: 0, height: 0, chainBottom: 0 });

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const chain = chainRef.current;
    const focus = focusRef.current;
    if (!layout || !chain || !focus) {
      return;
    }

    function updateAnchor() {
      if (!layout || !chain || !focus) {
        return;
      }
      const layoutBounds = layout.getBoundingClientRect();
      const chainBounds = chain.getBoundingClientRect();
      const focusBounds = focus.getBoundingClientRect();
      const nextAnchor = {
        top: focusBounds.top - layoutBounds.top,
        height: focusBounds.height,
        chainBottom: chainBounds.bottom - layoutBounds.top
      };
      setAnchor((current) =>
        current.top === nextAnchor.top &&
        current.height === nextAnchor.height &&
        current.chainBottom === nextAnchor.chainBottom
          ? current
          : nextAnchor
      );
    }

    updateAnchor();
    const observer = new ResizeObserver(updateAnchor);
    observer.observe(chain);
    observer.observe(focus);
    return () => observer.disconnect();
  }, []);

  const anchorStyle = {
    "--port-focus-top": `${anchor.top}px`,
    "--port-focus-height": `${anchor.height}px`,
    "--port-chain-bottom": `${anchor.chainBottom}px`
  } as CSSProperties;

  return { layoutRef, chainRef, focusRef, anchorStyle };
}

export function PortPrototypeHierarchy(props: {
  ownerName: string;
  ownerKind: string;
  ownerSwcKind?: SwcKind;
  onOwnerOpen?: () => void;
  portName: string;
  direction: string;
  portDirection: PortDirection;
  interfaceKind?: PortInterfaceKind;
  interfaceRef?: string;
  detailsFromInterface?: boolean;
  onInterfaceOpen?: (referencePath: string) => void;
  canOpenInterface?: (referencePath: string) => boolean;
  children: ReactNode;
}) {
  const anchor = useHierarchyAnchor();
  const interfaceRef = props.interfaceRef;
  const interfaceName = formatReferenceShortName(interfaceRef ?? "-");
  const canOpenInterface = Boolean(
    interfaceRef &&
    props.onInterfaceOpen &&
    props.canOpenInterface?.(interfaceRef)
  );

  return (
    <section ref={anchor.layoutRef} className={`model-port-hierarchy is-linear is-prototype${props.detailsFromInterface ? " is-member-view" : ""}`} style={anchor.anchorStyle} aria-label="Port relationship hierarchy">
      <div ref={anchor.chainRef} className="model-port-hierarchy-chain">
        <div className={`model-port-hierarchy-card model-port-hierarchy-owner${props.ownerSwcKind === "service" || props.ownerSwcKind === "service-proxy" ? " is-service" : ""}${props.ownerKind === "Software composition" ? " is-composition" : ""}`}>
          <SwcHierarchyIcon kind={props.ownerSwcKind} />
          <div className="model-port-hierarchy-card-content">
            <span className="model-port-hierarchy-kind">{props.ownerKind}</span>
            {props.onOwnerOpen ? (
              <button type="button" onClick={props.onOwnerOpen}>{props.ownerName}</button>
            ) : (
              <strong>{props.ownerName}</strong>
            )}
          </div>
        </div>
        <div className="model-port-hierarchy-link model-port-hierarchy-ownership"><span>has port</span></div>
        <div ref={anchor.focusRef} className="model-port-hierarchy-card model-port-hierarchy-prototype is-current" aria-current="step">
          <PortHierarchyPortIcon direction={props.portDirection} interfaceKind={props.interfaceKind} />
          <div className="model-port-hierarchy-card-content">
            <span className="model-port-hierarchy-kind">{props.direction} port prototype</span>
            <strong>{props.portName}</strong>
          </div>
        </div>
        {interfaceRef && (
          <>
            <div className="model-port-hierarchy-link model-port-hierarchy-reference"><span>references</span></div>
            <div className="model-port-hierarchy-card model-port-hierarchy-interface">
              <PortInterfaceHierarchyIcon />
              <div className="model-port-hierarchy-card-content">
                <span className="model-port-hierarchy-kind">Port interface</span>
                {canOpenInterface ? (
                  <button type="button" onClick={() => props.onInterfaceOpen?.(interfaceRef)}>
                    {interfaceName}
                  </button>
                ) : (
                  <strong>{interfaceName}</strong>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {props.detailsFromInterface ? (
        <MemberLink label={props.interfaceKind === "client-server" ? "has operations" : "has members"} startX={51} />
      ) : (
        <div className="model-port-hierarchy-detail-link" aria-hidden="true">
          <span className="model-port-hierarchy-detail-drop" />
        </div>
      )}
      <div className="model-port-general-panel">
        {props.children}
      </div>
    </section>
  );
}

export function PortInterfaceHierarchy(props: {
  interfaceName: string;
  interfaceKind?: PortInterfaceKind;
  detailsFromInterface?: boolean;
  portReferences: EntityReferenceInstance[];
  onPortOpen?: (instance: EntityReferenceInstance) => void;
  formatPortType: (instanceType: string) => string;
  children: ReactNode;
}) {
  const anchor = useHierarchyAnchor();
  // The reverse-reference index also contains non-port usages. Only port
  // prototypes belong in this branch of the hierarchy.
  const portsById = new Map<string, EntityReferenceInstance>();
  for (const instance of props.portReferences) {
    if (instance.portId && !portsById.has(instance.portId)) {
      portsById.set(instance.portId, instance);
    }
  }
  const ports = [...portsById.values()].sort((left, right) =>
    left.referencingObjectName.localeCompare(right.referencingObjectName) ||
    left.instanceName.localeCompare(right.instanceName)
  );

  return (
    <section ref={anchor.layoutRef} className={`model-port-hierarchy is-linear is-interface${props.detailsFromInterface ? " is-member-view" : ""}`} style={anchor.anchorStyle} aria-label="Port interface relationship hierarchy">
      <div ref={anchor.chainRef} className="model-port-hierarchy-chain">
        <span className="model-port-hierarchy-heading">Port prototypes referencing this interface</span>
        {ports.length > 0 ? (
          <ul className="model-port-hierarchy-branches">
            {ports.map((instance) => (
              <li key={instance.portId}>
                <div className="model-port-hierarchy-card">
                  <PortHierarchyPortIcon
                    direction={getPrototypeDirection(instance.instanceType)}
                    interfaceKind={props.interfaceKind}
                  />
                  <div className="model-port-hierarchy-card-content">
                    <span className="model-port-hierarchy-kind" title={instance.instanceType}>
                      {props.formatPortType(instance.instanceType)} of {instance.referencingObjectName}
                    </span>
                    {props.onPortOpen ? (
                      <button type="button" onClick={() => props.onPortOpen?.(instance)}>
                        {instance.instanceName}
                      </button>
                    ) : (
                      <strong>{instance.instanceName}</strong>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <span className="model-port-hierarchy-empty">No referencing port prototypes discovered.</span>
        )}
        {ports.length > 0 && <div className="model-port-hierarchy-link"><span>reference</span></div>}
        <div ref={anchor.focusRef} className="model-port-hierarchy-card is-current" aria-current="step">
          <PortInterfaceHierarchyIcon />
          <div className="model-port-hierarchy-card-content">
            <span className="model-port-hierarchy-kind">Port interface</span>
            <strong>{props.interfaceName}</strong>
          </div>
        </div>
      </div>
      {props.detailsFromInterface ? (
        <MemberLink label={props.interfaceKind === "client-server" ? "has operations" : "has members"} startX={49} />
      ) : (
        <div className="model-port-hierarchy-detail-link" aria-hidden="true" />
      )}
      <div className="model-port-general-panel">
        {props.children}
      </div>
    </section>
  );
}

function MemberLink(props: { label: string; startX: number }) {
  return (
    <div className="model-port-hierarchy-member-link" aria-label={props.label}>
      <svg viewBox="0 0 100 54" preserveAspectRatio="none" aria-hidden="true">
        <path d={`M ${props.startX} 0 V 32 H 17 V 50`} />
      </svg>
      <span>{props.label}</span>
    </div>
  );
}

function getPrototypeDirection(instanceType: string): PortDirection {
  if (instanceType.toUpperCase() === "P-PORT-PROTOTYPE") {
    return "provided";
  }
  if (instanceType.toUpperCase() === "R-PORT-PROTOTYPE") {
    return "required";
  }
  return "provided-required";
}

function isReceiverPort(direction: PortDirection, interfaceKind?: PortInterfaceKind) {
  // Only sender-receiver ports use the triangular glyph. Other interface kinds
  // have their own shapes, which should keep their original orientation.
  return direction === "required" &&
    (interfaceKind === "sender-receiver" || interfaceKind === "unknown" || !interfaceKind);
}

export function PortHierarchyPortIcon(props: {
  direction: PortDirection;
  interfaceKind?: PortInterfaceKind;
}) {
  return (
    <span className="model-port-hierarchy-icon model-port-hierarchy-port-icon" aria-hidden="true">
      <PortSymbol
        direction={props.direction}
        interfaceKind={props.interfaceKind}
        className={isReceiverPort(props.direction, props.interfaceKind) ? "is-receiver" : undefined}
      />
    </span>
  );
}

function SwcHierarchyIcon(props: { kind?: SwcKind }) {
  return (
    <span className="model-port-hierarchy-icon model-port-hierarchy-swc-icon" aria-hidden="true">
      <svg viewBox="0 0 28 28">
        <path d="M2 9H6M2 19H6M22 9H26M22 19H26" />
        <rect x="6" y="4" width="16" height="20" rx="2" />
        <text x="14" y="17" textAnchor="middle">{formatSwcKindSymbol(props.kind)}</text>
      </svg>
    </span>
  );
}

function PortInterfaceHierarchyIcon() {
  return (
    <span className="model-port-hierarchy-icon model-port-hierarchy-interface-icon" aria-hidden="true">
      <svg viewBox="0 0 28 28">
        <path d="M2 10H10M2 18H10M10 5V23M10 8H17C22 8 25 10 25 14C25 18 22 20 17 20H10" />
      </svg>
    </span>
  );
}
