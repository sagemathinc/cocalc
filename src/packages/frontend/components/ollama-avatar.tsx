import { CSS } from "../app-framework";
import ollamaPng from "./ollama.png";

export default function OllamaAvatar({
  size = 64,
  style,
}: {
  size: number;
  style?: CSS;
}) {
  // render the ollamaPng (a square png image with transparent background) with the given size and background color

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-block",
        position: "relative",
      }}
    >
      <img
        src={ollamaPng}
        style={{
          width: size,
          height: size,
          backgroundColor: "transparent",
          ...style,
        }}
      />
    </div>
  );
}
