import AutomaticPayments from "./automatic-payments";
import ClosingDate from "./closing-date";
import { CSSProperties } from "react";

interface Props {
  style?: CSSProperties;
}

export default function Config({ style } : Props) {
  return (
    <div style={{ display: "flex", ...style }}>
      <AutomaticPayments />
      <div style={{ width: "15px" }} />
      <ClosingDate />
    </div>
  );
}
