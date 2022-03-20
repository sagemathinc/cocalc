import { ReactNode } from "react";
import { useFrameContext } from "./hooks";
import { getElement, getParams } from "./tools/tool-panel";

interface Props {
  children: ReactNode;
  id: string;
  selectable?: boolean;
  edgeCreate?: boolean;
}

export default function NotFocused({
  children,
  id,
  selectable,
  edgeCreate,
}: Props) {
  const frame = useFrameContext();
  const onClick = selectable
    ? (e) => select(id, e, frame)
    : edgeCreate
    ? (e) => edge(id, e, frame)
    : undefined;
  return (
    <div
      className={
        edgeCreate
          ? `cocalc-whiteboard-edge-select${
              frame.desc.getIn(["edgeStart", "id"]) === id ? "ed" : ""
            }`
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
    </div>
  );
}

function select(id, e, frame) {
  e.stopPropagation();
  const edgeStart = frame.desc.get("edgeStart");
  if (edgeStart) {
    frame.actions.clearEdgeCreateStart(frame.id);
    // I'm ignoring edgeStart.get('position') here until I get a sense
    // for cocalc if we want to automate and make manual where the edge
    // comes out, etc.  Maybe we want less user control for less cognitive load,
    // and to be more like a digraph...
    const params = getParams("edge", frame.desc.get("edgeId"));
    frame.actions.createEdge(edgeStart.get("id"), id, params);
    return;
  }
  // select
  frame.actions.setSelection(
    frame.id,
    id,
    e.altKey || e.metaKey || e.ctrlKey || e.shiftKey ? "toggle" : "only"
  );
}

function edge(id, e, frame) {
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
