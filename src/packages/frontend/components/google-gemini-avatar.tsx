import { CSSProperties } from "react";
import { Icon } from "./icon";

// I copied this straight from the openai website html, and modified it for react.
interface Props {
  size?;
  backgroundColor?;
  style?: CSSProperties;
  innerStyle?: CSSProperties;
}

export default function GoogleGeminiLogo({
  size,
  innerStyle,
  backgroundColor = "transparent",
  style,
}: Props) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-block",
        position: "relative",
        marginRight: "5px",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          backgroundColor,
          color: "white",
          height: size,
          top: "5px",
          ...innerStyle,
        }}
      >
        <Icon unicode={0x264a} style={{ fontSize: size - 2 }} />
      </div>
    </div>
  );
}
