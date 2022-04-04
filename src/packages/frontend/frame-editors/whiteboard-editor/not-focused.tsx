import { CSSProperties, ReactNode } from "react";
import { getElement } from "./tools/tool-panel";

interface Props {
  children: ReactNode;
  id: string;
  selectable?: boolean;
  edgeCreate?: boolean;
  edgeStart?: boolean;
  frame;
}

export default function NotFocused({
  children,
  id,
  selectable,
  edgeCreate,
  edgeStart,
  frame,
}: Props) {
  const onClick = selectable
    ? (e) => select(id, e, frame)
    : edgeCreate
    ? (e) => edge(id, e, frame)
    : undefined;
  return (
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
      onTouchStart={onClick}
    >
      {children}
      {edgeStart && <div style={HINT}>Select target of edge</div>}
    </div>
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

function edge(id, _e, frame) {
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
