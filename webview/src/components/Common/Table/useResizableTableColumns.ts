import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

const DEFAULT_MINIMUM_COLUMN_WIDTH = 100;
const KEYBOARD_RESIZE_STEP = 20;

/** Keeps column resizing behavior consistent across all webview tables. */
export function useResizableTableColumns(
  defaultWidths: number[],
  minimumColumnWidth = DEFAULT_MINIMUM_COLUMN_WIDTH
) {
  const [storedWidths, setStoredWidths] = useState(defaultWidths);
  const removePointerListenersRef = useRef<(() => void) | undefined>(undefined);
  const resizedColumnWidths = defaultWidths.map(
    (defaultWidth, columnIndex) => storedWidths[columnIndex] ?? defaultWidth
  );
  const totalColumnWidth = resizedColumnWidths.reduce((total, width) => total + width, 0);
  // Treat stored pixel values as relative weights. Percentage widths always
  // fill the available table space, so widening one column narrows the others
  // instead of introducing a horizontal scrollbar.
  const columnWidths = resizedColumnWidths.map((width) => {
    return `${(width / totalColumnWidth) * 100}%`;
  });
  const tableStyle = {
    width: "100%",
    minWidth: 0,
    tableLayout: "fixed"
  } as CSSProperties;

  useEffect(() => {
    return () => removePointerListenersRef.current?.();
  }, []);

  function updateColumnWidth(columnIndex: number, width: number) {
    const constrainedWidth = Math.max(minimumColumnWidth, width);
    setStoredWidths((currentWidths) =>
      defaultWidths.map((defaultWidth, index) => {
        if (index === columnIndex) {
          return constrainedWidth;
        }
        return currentWidths[index] ?? defaultWidth;
      })
    );
  }

  function startColumnResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    columnIndex: number
  ) {
    event.preventDefault();
    event.stopPropagation();
    removePointerListenersRef.current?.();

    const startPointerX = event.clientX;
    const startWidth = resizedColumnWidths[columnIndex] ?? minimumColumnWidth;

    // Window listeners keep the drag active when the pointer leaves the narrow handle.
    function resizeFromPointer(moveEvent: PointerEvent) {
      updateColumnWidth(columnIndex, startWidth + moveEvent.clientX - startPointerX);
    }

    function stopPointerResize() {
      window.removeEventListener("pointermove", resizeFromPointer);
      window.removeEventListener("pointerup", stopPointerResize);
      window.removeEventListener("pointercancel", stopPointerResize);
      removePointerListenersRef.current = undefined;
    }

    removePointerListenersRef.current = stopPointerResize;
    window.addEventListener("pointermove", resizeFromPointer);
    window.addEventListener("pointerup", stopPointerResize);
    window.addEventListener("pointercancel", stopPointerResize);
  }

  function resizeColumnWithKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    columnIndex: number
  ) {
    const currentWidth = resizedColumnWidths[columnIndex] ?? minimumColumnWidth;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      updateColumnWidth(columnIndex, currentWidth - KEYBOARD_RESIZE_STEP);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      updateColumnWidth(columnIndex, currentWidth + KEYBOARD_RESIZE_STEP);
    }
  }

  return {
    columnWidths,
    tableStyle,
    startColumnResize,
    resizeColumnWithKeyboard
  };
}
