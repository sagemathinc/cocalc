import { CSSProperties } from "react";

interface Props {
  epoch: number; // ms since epoch
  style?: CSSProperties;
}

export default function Timestamp({ epoch, style }: Props) {
  return (
    <span style={{ fontSize: "10pt", ...style }}>
      {epoch ? new Date(epoch).toLocaleString() : "-"}
    </span>
  );
}
