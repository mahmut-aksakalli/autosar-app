import { useState } from "react";
import type { ReactNode } from "react";

export function CollapsibleSection(props: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const { title, defaultOpen = false, children } = props;
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <section className="model-list-section model-communication-subsection">
      <button
        type="button"
        className="model-list-section-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="model-list-section-chevron" aria-hidden="true" />
        <span>{title}</span>
      </button>
      {isExpanded && children}
    </section>
  );
}
