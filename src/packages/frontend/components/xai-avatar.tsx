import { CSSProperties } from "react";

import { COLORS } from "@cocalc/util/theme";

interface Props {
  size: number;
  backgroundColor?: string;
  iconColor?: string;
  style?: CSSProperties;
  innerStyle?: CSSProperties;
}

export default function XAIAvatar({
  size,
  innerStyle,
  backgroundColor = "transparent",
  iconColor = COLORS.GRAY_DD,
  style,
}: Props) {
  const topOffset = size / 4;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          backgroundColor,
          color: iconColor,
          height: size,
          width: size,
          position: "relative",
          top: topOffset,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...innerStyle,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="150 100 550 500"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fill="currentColor">
            <polygon points="557.09,211.99 565.4,538.36 631.96,538.36 640.28,93.18" />
            <polygon points="640.28,56.91 538.72,56.91 379.35,284.53 430.13,357.05" />
            <polygon points="201.61,538.36 303.17,538.36 353.96,465.84 303.17,393.31" />
            <polygon points="201.61,211.99 430.13,538.36 531.69,538.36 303.17,211.99" />
          </g>
        </svg>
      </div>
    </div>
  );
}
