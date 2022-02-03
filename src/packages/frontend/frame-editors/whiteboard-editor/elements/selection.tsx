import { SELECTED_BORDER_COLOR } from "../focused";

export default function Selection({ canvasScale }) {
  return (
    <div
      style={{
        border: `${2 / canvasScale}px solid ${SELECTED_BORDER_COLOR}`,
        width: "100%",
        height: "100%",
      }}
    ></div>
  );
}
