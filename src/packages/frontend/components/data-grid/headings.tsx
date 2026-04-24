import Draggable from "react-draggable";
import { CSSProperties, ReactNode, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

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
  style,
  onMouseEnter,
  onMouseLeave,
}: {
  width?: number;
  title?: ReactNode;
  direction?: SortDirection;
  onSortClick?: () => void;
  setWidth?: (number) => void;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const ignoreClickRef = useRef<boolean>(false);
  return (
    <th
      style={{
        cursor: "pointer",
        color: COLORS.FG_BLUE,
        background: COLORS.GRAY_LLL,
        padding: "10px 5px",
        border: `1px solid ${COLORS.GRAY_LL}`,
        position: "relative",
        ...style,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
