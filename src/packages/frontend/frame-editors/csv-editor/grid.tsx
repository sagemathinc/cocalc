import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import CSV from "@cocalc/frontend/components/data-grid/csv";

export default function Grid({ value }) {
  const { desc } = useFrameContext();
  return (
    <div style={{ fontSize: desc.get("font_size"), height: "100%", margin:'0 15px' }}>
      <CSV value={value} />
    </div>
  );
}
