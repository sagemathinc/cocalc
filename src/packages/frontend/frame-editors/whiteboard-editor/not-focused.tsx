import { CSSProperties, ReactNode, useCallback, useRef } from "react";
import { getElement } from "./tools/tool-panel";
import Draggable from "react-draggable";

interface Props {
  children: ReactNode;
  element;
  selectable?: boolean;
  edgeCreate?: boolean;
  edgeStart?: boolean;
  frame;
}

export default function NotFocused({
  children,
  element,
  selectable,
  edgeCreate,
  edgeStart,
  frame,
}: Props) {
  const { id } = element;

  // Right after dragging, we ignore the onClick so the object doesn't get selected:
  const ignoreNextClickRef = useRef<boolean>(false);

  const onClick = useCallback(
    (e) => {
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }
      if (selectable) {
        select(id, e, frame);
      } else if (edgeCreate) {
        edge(id, frame);
      }
    },
    [selectable, edgeCreate, id, frame]
  );
  return (
    <Draggable
      position={{ x: 0, y: 0 }}
      cancel={".nodrag"}
      disabled={!(selectable && !element.locked)}
      onStop={(_, data) => {
        if (data.x || data.y) {
          frame.actions.moveElements([element], data);
          ignoreNextClickRef.current = true;
        }
      }}
    >
      <div
        className={
          edgeCreate
            ? `cocalc-whiteboard-edge-select${edgeStart ? "ed" : ""}`
            : undefined
        }
        style={{
          width: "100%",
          height: "100%",
          cursor: selectable ? "pointer" : undefined,
        }}
        onClick={onClick}
        onTouchEnd={onClick}
      >
        {children}
        {edgeStart && <div style={HINT}>Select target of edge</div>}
      </div>
    </Draggable>
  );
}

const HINT = {
  position: "absolute",
  bottom: "-38px",
  overflow: "visible",
  width: "150px",
  background: "white",
  border: "1px solid #ccc",
  padding: "5px",
  borderRadius: "3px",
  boxShadow: "3px 3px 3px #ccc",
} as CSSProperties;

function select(id, e, frame) {
  e.stopPropagation();
  // select
  frame.actions.setSelection(
    frame.id,
    id,
    e.altKey || e.metaKey || e.ctrlKey || e.shiftKey ? "toggle" : "only"
  );
}

function edge(id, frame) {
  const from = frame.desc.getIn(["edgeStart", "id"]);
  if (from != null) {
    const elt = getElement("edge", frame.desc.get("edgeId"));
    if (from != id) {
      frame.actions.createEdge(from, id, elt.data);
    }
    frame.actions.clearEdgeCreateStart(frame.id);
  } else {
    frame.actions.setEdgeCreateStart(frame.id, id);
  }
}
