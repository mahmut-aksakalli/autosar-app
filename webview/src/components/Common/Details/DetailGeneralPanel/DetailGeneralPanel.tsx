import type { ReactNode } from "react";
import "./DetailGeneralPanel.css";

/** Frames General properties like the port prototype and interface panels. */
export function DetailGeneralPanel(props: { children: ReactNode }) {
  return <div className="model-detail-general-panel">{props.children}</div>;
}
