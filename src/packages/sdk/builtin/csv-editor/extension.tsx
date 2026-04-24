import { defineEditor, registerExtension } from "@cocalc/sdk";
import CSV from "@cocalc/frontend/components/data-grid/csv";
import { CodemirrorEditor } from "@cocalc/frontend/frame-editors/code-editor/codemirror-editor";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

function Grid({ value }: { value: string }) {
  const { actions, desc } = useFrameContext();
  return (
    <div
      style={{
        fontSize: desc.get("font_size"),
        height: "100%",
      }}
    >
      <CSV
        value={value}
        errHint={
          <div>
            Try using{" "}
            <a
              onClick={() => {
                actions.show_focused_frame_of_type("cm");
              }}
            >
              the Raw Data frame
            </a>{" "}
            instead.
          </div>
        }
      />
    </div>
  );
}

registerExtension(
  defineEditor({
    id: "cocalc/csv-editor",
    name: "CSV Editor",
    version: "0.0.1",
    source: "builtin",
    extensions: ["csv"],
    icon: "csv",
    nativeFrames: ["timetravel"],
    sync: {
      doctype: "syncstring",
    },
    frames: {
      "cocalc/csv-grid": {
        short: "Grid",
        name: "Grid",
        icon: "table",
        component: Grid,
        commands: ["decrease_font_size", "increase_font_size", "chatgpt"],
      },
      "cocalc/csv-raw": {
        short: "Raw",
        name: "Raw Data",
        icon: "code",
        component: CodemirrorEditor,
        commands: [
          "chatgpt",
          "print",
          "decrease_font_size",
          "increase_font_size",
          "save",
          "time_travel",
          "replace",
          "find",
          "goto_line",
          "cut",
          "paste",
          "copy",
          "undo",
          "redo",
        ],
      },
    },
    defaultLayout: {
      direction: "col",
      type: "node",
      first: {
        type: "cocalc/csv-grid",
      },
      second: {
        type: "cocalc/csv-raw",
      },
    },
  }),
);
