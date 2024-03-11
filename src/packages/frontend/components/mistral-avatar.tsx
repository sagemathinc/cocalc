import { CSS } from "@cocalc/frontend/app-framework";

import MistralPNG from "./mistral.png";

export default function MistralAvatar({
  size = 64,
  style,
  backgroundColor = "transparent",
}: {
  size: number;
  style?: CSS;
  backgroundColor?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-block",
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          backgroundColor,
          color: "white",
          height: size,
          top: "0px",
        }}
      >
        <img src={MistralPNG} width={size} height={size} />
      </div>
    </div>
  );
}
