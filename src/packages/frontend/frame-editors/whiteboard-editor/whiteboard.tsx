import { useRef } from "react";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State, elementsList } from "./actions";
import Canvas from "./canvas";
import ToolPanel from "./tools/panel";
import PenPanel from "./tools/pen";
import NotePanel from "./tools/note";
import TextPanel from "./tools/text";
import IconPanel from "./tools/icon";
import TimerPanel from "./tools/timer";
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
  const readOnly = useEditor("read_only");
  const elements = elementsList(useEditor("elements"));
  const selectedTool = desc.get("selectedTool") ?? "select";
  const evtToDataRef = useRef<Function | null>(null);

  if (!is_loaded || elements == null) {
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

  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      {isFocused && (
        <>
          <ToolPanel
            selectedTool={desc.get("selectedTool") ?? "select"}
            readOnly={readOnly}
          />
          {!desc.get("selectedToolHidePanel") && (
            <>
              {desc.get("selectedTool") == "pen" && <PenPanel />}
              {desc.get("selectedTool") == "note" && <NotePanel />}
              {desc.get("selectedTool") == "text" && <TextPanel />}
              {desc.get("selectedTool") == "icon" && <IconPanel />}
              {desc.get("selectedTool") == "timer" && <TimerPanel />}
            </>
          )}
          <NavigationPanel fontSize={font_size} elements={elements} />
        </>
      )}
      <Upload evtToDataRef={evtToDataRef} readOnly={readOnly}>
        <Canvas
          elements={elements}
          font_size={font_size}
          selection={
            selectedTool == "select"
              ? new Set(desc.get("selection")?.toJS() ?? [])
              : undefined
          }
          selectedTool={selectedTool}
          evtToDataRef={evtToDataRef}
          readOnly={readOnly}
        />
      </Upload>
    </div>
  );
}
