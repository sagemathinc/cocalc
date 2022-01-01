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
    body = dateOnly
      ? t.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : t.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
        });
  }
  return <span style={{ fontSize: "10pt", ...style }}>{body}</span>;
}
