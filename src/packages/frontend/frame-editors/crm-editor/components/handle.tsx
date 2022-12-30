import { Icon } from "@cocalc/frontend/components";
import { CSSProperties } from "react";

interface Props {
  style?: CSSProperties;
}

export default function Handle({ style }: Props) {
  return (
    <div
      style={{
        display: "inline-block",
        cursor: "move",
        margin: "-5px 0 0 -5px",
        ...style,
      }}
    >
      <Icon
        key="first"
        name="ellipsis"
        rotate="90"
        style={{ margin: "10px -15px 0 0", fontSize: "20px" }}
      />
      <Icon
        key="second"
        name="ellipsis"
        rotate="90"
        style={{ fontSize: "20px" }}
      />
    </div>
  );
}
