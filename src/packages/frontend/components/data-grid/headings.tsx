import Draggable from "react-draggable";
import { CSSProperties, ReactNode, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components";

export type SortDirection = "ascending" | "descending";
export function nextSortState(direction?: SortDirection | null) {
  if (direction == "descending") {
    return "ascending";
  } else if (direction == "ascending") {
    return null;
  } else {
    return "descending";
  }
}

const DIRECTION_STYLE = {
  float: "right",
  marginTop: "2.5px",
  cursor: "pointer",
} as CSSProperties;

export function ColumnHeading({
  width = 150,
  title,
  direction,
  onSortClick,
  setWidth,
}: {
  width?: number;
  title?: ReactNode;
  direction?: SortDirection;
  onSortClick?: () => void;
  setWidth?: (number) => void;
}) {
  const ignoreClickRef = useRef<boolean>(false);
  return (
    <th
      style={{
        cursor: "pointer",
        color: "#428bca",
        background: "rgb(250, 250, 250)",
        padding: "10px 5px",
        border: "1px solid #eee",
        position: "relative",
      }}
    >
      <div
        style={{ width: width ?? 150 }}
        onClick={
          onSortClick
            ? () => {
                if (ignoreClickRef.current) {
                  ignoreClickRef.current = false;
                  return;
                }
                onSortClick();
              }
            : undefined
        }
      >
        {title ? title : <>&nbsp;</>}
        {direction && (
          <Icon
            style={DIRECTION_STYLE}
            name={direction == "ascending" ? "caret-down" : "caret-up"}
          />
        )}
        {setWidth && (
          <ResizeHandle
            setWidth={setWidth}
            width={width}
            ignoreClick={() => {
              ignoreClickRef.current = true;
            }}
          />
        )}
      </div>
    </th>
  );
}

function ResizeHandle({ setWidth, width, ignoreClick }) {
  const [pos, setPos] = useState<any>(undefined);
  const nodeRef = useRef<any>({});
  return (
    <Draggable
      nodeRef={nodeRef}
      onMouseDown={ignoreClick}
      position={pos}
      axis="x"
      onStop={() => {
        setPos({ x: 0, y: 0 });
      }}
      onDrag={(_, data) => {
        setPos({ x: 0, y: 0 });
        ignoreClick();
        setWidth(width + data.deltaX);
      }}
    >
      <span ref={nodeRef} className="cocalc-data-grid-column-resizer"></span>
    </Draggable>
  );
}
