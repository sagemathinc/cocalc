import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import CSV from "@cocalc/frontend/components/data-grid/csv";

export interface GridProps {
  value: string;
}

export default function Grid({ value }: GridProps) {
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
