import { useMemo, useRef } from "react";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State, elementsList } from "./actions";
import Canvas from "./canvas";
import ToolPanel from "./tools/panel";
import PenPanel from "./tools/pen";
import NotePanel from "./tools/note";
import TextPanel from "./tools/text";
import CodePanel from "./tools/code";
import IconPanel from "./tools/icon";
import TimerPanel from "./tools/timer";
import FramePanel from "./tools/frame";
import EdgePanel from "./tools/edge";
import NavigationPanel from "./tools/navigation";
import { useFrameContext } from "./hooks";
import Upload from "./tools/upload";
import KernelPanel from "./elements/code/kernel";

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

  const elementsMap = useEditor("elements");
  const elements = useMemo(() => {
    return elementsList(elementsMap);
  }, [elementsMap]);
  const cursorsMap = useEditor("cursors");
  const cursors = useMemo(() => {
    const cursors: { [id: string]: { [account_id: string]: any[] } } = {};
    for (const [account_id, locs] of cursorsMap) {
      const x = locs?.toJS();
      const id = x?.[0]?.id;
      if (id == null) continue;
      if (cursors[id] == null) {
        cursors[id] = {};
      }
      cursors[id][account_id] = x;
    }
    return cursors;
  }, [cursorsMap]);

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

  const tool = desc.get("selectedTool");
  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      {isFocused && (
        <>
          {!readOnly && <KernelPanel />}
          <ToolPanel selectedTool={tool ?? "select"} readOnly={readOnly} />
          {!desc.get("selectedToolHidePanel") && (
            <>
              {tool == "pen" && <PenPanel />}
              {tool == "note" && <NotePanel />}
              {tool == "text" && <TextPanel />}
              {tool == "code" && <CodePanel />}
              {tool == "icon" && <IconPanel />}
              {tool == "timer" && <TimerPanel />}
              {tool == "frame" && <FramePanel />}
              {tool == "edge" && <EdgePanel />}
            </>
          )}
          <NavigationPanel
            fontSize={font_size}
            elements={elements}
            elementsMap={elementsMap}
          />
        </>
      )}
      <Upload evtToDataRef={evtToDataRef} readOnly={readOnly}>
        <Canvas
          elements={elements}
          elementsMap={elementsMap}
          font_size={font_size}
          selection={
            selectedTool == "select"
              ? new Set(desc.get("selection")?.toJS() ?? [])
              : undefined
          }
          selectedTool={selectedTool}
          evtToDataRef={evtToDataRef}
          readOnly={readOnly}
          cursors={cursors}
        />
      </Upload>
    </div>
  );
}
