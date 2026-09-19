interface HighlightedTextProps {
  text: string;
  query?: string;
  active?: boolean;
  searchNodeId?: string;
  searchKey?: string;
}

/** Highlights every case-insensitive occurrence without changing the displayed text. */
export function HighlightedText(props: HighlightedTextProps) {
  const query = props.query?.trim();
  if (!query) {
    return (
      <span data-search-node-id={props.searchNodeId} data-search-key={props.searchKey}>
        {props.text}
      </span>
    );
  }

  const normalizedText = props.text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;

  while (cursor < props.text.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    if (matchIndex < 0) {
      parts.push({ text: props.text.slice(cursor), match: false });
      break;
    }

    if (matchIndex > cursor) {
      parts.push({ text: props.text.slice(cursor, matchIndex), match: false });
    }
    parts.push({
      text: props.text.slice(matchIndex, matchIndex + query.length),
      match: true
    });
    cursor = matchIndex + query.length;
  }

  let markClassName = "autosar-search-highlight";
  if (props.active) {
    markClassName += " is-active";
  }

  return (
    <span data-search-node-id={props.searchNodeId} data-search-key={props.searchKey}>
      {parts.map((part, index) => {
        if (!part.match) {
          return <span key={index}>{part.text}</span>;
        }
        return (
          <mark key={index} className={markClassName}>
            {part.text}
          </mark>
        );
      })}
    </span>
  );
}
