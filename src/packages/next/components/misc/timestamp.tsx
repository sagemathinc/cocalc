import { CSSProperties } from "react";

interface Props {
  epoch: number; // ms since epoch
  style?: CSSProperties;
  dateOnly?: boolean;
}

export default function Timestamp({ epoch, style, dateOnly }: Props) {
  let body: string = "-";
  if (epoch) {
    const t = new Date(epoch);
    body = dateOnly ? t.toLocaleDateString() : t.toLocaleString();
  }
  return <span style={{ fontSize: "10pt", ...style }}>{body}</span>;
}
