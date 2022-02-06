import { useRef } from "react";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State } from "./actions";
import Canvas from "./canvas";
import ToolPanel from "./tools/panel";
import PenPanel from "./tools/pen";
import NotePanel from "./tools/note";
import TextPanel from "./tools/text";
import IconPanel from "./tools/icon";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "./hooks";
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
  const elements = useEditor("elements")
    .valueSeq()
    .filter((x) => x != null)
    .toJS();

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

  const selectedTool = desc.get("selectedTool") ?? "select";
  const evtToDataRef = useRef<Function | null>(null);

  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      {isFocused && (
        <>
          <ToolPanel selectedTool={desc.get("selectedTool") ?? "select"} />
          {!desc.get("selectedToolHidePanel") && (
            <>
              {desc.get("selectedTool") == "pen" && <PenPanel />}
              {desc.get("selectedTool") == "note" && <NotePanel />}
              {desc.get("selectedTool") == "text" && <TextPanel />}
              {desc.get("selectedTool") == "icon" && <IconPanel />}
            </>
          )}
          <NavigationPanel fontSize={font_size} elements={elements} />
        </>
      )}
      <Upload evtToDataRef={evtToDataRef}>
        <Canvas
          elements={elements}
          font_size={font_size}
          selection={
            selectedTool == "select"
              ? new Set(desc.get("selection")?.toJS() ?? [])
              : undefined
          }
          selectedTool={selectedTool}
          fitToScreen={desc.get("fitToScreen")}
          evtToDataRef={evtToDataRef}
        />
      </Upload>
    </div>
  );
}
