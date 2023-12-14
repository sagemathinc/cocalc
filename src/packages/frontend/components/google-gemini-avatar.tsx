import { CSSProperties } from "react";
import { Icon } from "./icon";

// I copied this straight from the openai website html, and modified it for react.
interface Props {
  size: number;
  backgroundColor?: string;
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
        marginRight: "1px",
        ...style,
      }}
    >
      <Icon
        unicode={0x264a}
        style={{
          fontSize: size - 4,
          verticalAlign: "inherit",
          fontWeight: "normal",
          backgroundColor,
          ...innerStyle,
        }}
      />
    </div>
  );
}
