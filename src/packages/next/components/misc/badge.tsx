import { CSSProperties } from "react";
import { Badge as BadgeAntd } from "antd";

interface Props {
  count?: number;
  style?: CSSProperties;
}

export default function Badge({ count, style }: Props) {
  return (
    <BadgeAntd
      overflowCount={1e8}
      count={count ?? 0}
      style={{
        backgroundColor: "#e6f7ff",
        color: "black",
        minWidth: "30px",
        ...style,
      }}
    />
  );
}
