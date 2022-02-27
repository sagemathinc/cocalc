import { SELECTED_BORDER_COLOR, SELECTED_BORDER_WIDTH } from "./style";

export default function Selection({ canvasScale }) {
  return (
    <div
      style={{
        border: `${SELECTED_BORDER_WIDTH / canvasScale}px solid ${SELECTED_BORDER_COLOR}`,
        width: "100%",
        height: "100%",
      }}
    ></div>
  );
}
