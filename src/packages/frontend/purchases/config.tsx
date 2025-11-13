import ClosingDate from "./closing-date";
import { CSSProperties } from "react";

interface Props {
  style?: CSSProperties;
}

const SPACE = "10px";

export default function Config({ style }: Props) {
  return (
    <div style={{ display: "flex", ...style }}>
      <ClosingDate />
      <div style={{ width: SPACE, height: SPACE }} />
    </div>
  );
}
