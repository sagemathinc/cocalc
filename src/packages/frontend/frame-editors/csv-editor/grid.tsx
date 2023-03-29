import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import CSV from "@cocalc/frontend/components/data-grid/csv";

export default function Grid({ value }) {
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
