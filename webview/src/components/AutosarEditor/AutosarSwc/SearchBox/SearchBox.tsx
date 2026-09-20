import type { RefObject } from "react";
import "./SearchBox.css";

interface SearchBoxProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  activeMatchIndex: number;
  matchCount: number;
  onQueryChange: (query: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClear: () => void;
}

/** Search controls stay in screen space and do not participate in graph gestures. */
export function SearchBox(props: SearchBoxProps) {
  let resultLabel = "No results";
  if (!props.query.trim()) {
    resultLabel = "";
  } else if (props.matchCount > 0) {
    resultLabel = `${props.activeMatchIndex + 1} / ${props.matchCount}`;
  }

  return (
    <div
      className="autosar-graph-search nodrag nopan nowheel"
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        props.onClear();
      }}
    >
      <input
        ref={props.inputRef}
        type="search"
        value={props.query}
        placeholder="Search graph"
        aria-label="Search graph"
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
              props.onPrevious();
            } else {
              props.onNext();
            }
            return;
          }
        }}
      />
      <span className="autosar-graph-search-count" aria-live="polite">
        {resultLabel}
      </span>
      <button
        type="button"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        disabled={props.matchCount === 0}
        onClick={props.onPrevious}
      >
        ↑
      </button>
      <button
        type="button"
        title="Next match (Enter)"
        aria-label="Next match"
        disabled={props.matchCount === 0}
        onClick={props.onNext}
      >
        ↓
      </button>
      <button
        type="button"
        title="Clear search (Escape)"
        aria-label="Clear search"
        disabled={!props.query}
        onClick={props.onClear}
      >
        ×
      </button>
    </div>
  );
}
