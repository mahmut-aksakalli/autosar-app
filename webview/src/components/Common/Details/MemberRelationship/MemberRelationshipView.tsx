import type { ReactNode } from "react";
import "./MemberRelationshipView.css";

export interface MemberRelationshipItem {
  key: string;
  label: string;
  description?: string;
  number?: string;
}

/** A member list connected to the selected member's semantic path and full details. */
export function MemberRelationshipView(props: {
  title: string;
  items: MemberRelationshipItem[];
  selectedKey?: string;
  onSelect: (key: string) => void;
  selectedKind: string;
  selectedName?: string;
  focus?: ReactNode;
  path?: ReactNode;
  listFooter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="model-member-relationship">
      <div className={`model-member-relationship-left${props.listFooter ? " has-footer" : ""}`}>
        <div className="model-member-relationship-list">
          <h3>{props.title}</h3>
          {props.items.length > 0 ? (
            <ul>
              {props.items.map((item) => {
                const isSelected = item.key === props.selectedKey;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={isSelected ? "is-selected" : undefined}
                      aria-pressed={isSelected}
                      title={item.label}
                      onClick={() => props.onSelect(item.key)}
                    >
                      {item.number && <span className="model-member-relationship-number">{item.number}</span>}
                      <span className="model-member-relationship-item-text">
                        <strong>{item.label}</strong>
                        {item.description && <small>{item.description}</small>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="model-list-empty">No {props.title.toLowerCase()} discovered.</p>
          )}
        </div>
        {props.listFooter && (
          <div className="model-member-relationship-list-footer">{props.listFooter}</div>
        )}
      </div>
      <div className="model-member-relationship-detail">
        {props.selectedName && <span className="model-member-relationship-detail-link" aria-hidden="true">details</span>}
        {props.selectedName && (
          <>
            {props.focus ?? (
              <div className="model-member-relationship-focus">
                <span className="model-member-relationship-symbol" aria-hidden="true">
                  {props.selectedKind === "Operation" ? "O" : "D"}
                </span>
                <span>
                  <strong>{props.selectedName}</strong>
                  <small>{props.selectedKind}</small>
                </span>
              </div>
            )}
            {props.path}
          </>
        )}
        {props.children && <div className="model-member-relationship-properties">{props.children}</div>}
      </div>
    </div>
  );
}
