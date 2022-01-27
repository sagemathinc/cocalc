import { useRef } from "react";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State } from "./actions";
import { Element } from "./types";
import Canvas from "./canvas";
import ToolPanel from "./tools/panel";
import PenPanel from "./tools/pen";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import Upload from "./tools/upload";

interface Props {
  actions: Actions;
  path: string;
  project_id: string;
  font_size?: number;
  desc;
}

export default function Whiteboard({
  path,
  project_id,
  font_size,
  desc,
}: Props) {
  const { isFocused } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });

  const is_loaded = useEditor("is_loaded");
  const elements = useEditor("elements").toJS();

  if (!is_loaded) {
    return (
      <div
        style={{
          fontSize: "40px",
          textAlign: "center",
          padding: "15px",
          color: "#999",
        }}
      >
        <Loading />
      </div>
    );
  }

  const x: Element[] = [];
  for (const id in elements) {
    const element = elements[id];
    if (!element) continue;
    x.push(element);
  }

  const selectedTool = desc.get("selectedTool") ?? "select";
  const evtToDataRef = useRef<Function | null>(null);

  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      {isFocused && (
        <>
          <ToolPanel selectedTool={desc.get("selectedTool") ?? "select"} />
          {desc.get("selectedTool") == "pen" && <PenPanel />}
          <NavigationPanel fontSize={font_size} elements={x} />
        </>
      )}
      <Upload evtToDataRef={evtToDataRef}>
        <Canvas
          elements={x}
          font_size={font_size}
          focusedId={
            selectedTool == "select" ? desc.get("focusedId") : undefined
          }
          selectedTool={selectedTool}
          fitToScreen={desc.get("fitToScreen")}
          evtToDataRef={evtToDataRef}
        />
      </Upload>
    </div>
  );
}
