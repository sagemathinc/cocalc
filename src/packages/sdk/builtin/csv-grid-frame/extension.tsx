import { defineFrame, registerExtension } from "@cocalc/sdk";
import CSV from "@cocalc/frontend/components/data-grid/csv";
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
  defineFrame({
    id: "cocalc/csv-grid-frame",
    name: "CSV Grid Frame",
    version: "0.0.1",
    source: "builtin",
    targetEditors: ["cocalc/csv-editor"],
    frame: {
      type: "cocalc/csv-grid",
      short: "Grid",
      name: "Grid",
      icon: "table",
      component: Grid,
      commands: ["decrease_font_size", "increase_font_size", "chatgpt"],
    },
  }),
);
