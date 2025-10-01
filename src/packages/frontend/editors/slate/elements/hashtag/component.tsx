import { CSSProperties } from "react";

import { TITLE_BAR_BORDER } from "@cocalc/frontend/frame-editors/frame-tree/style";
import { FOCUSED_COLOR } from "../../util";

// Looks like antd tag but scales (and a lot simpler).
export const STYLE = {
  padding: "0 7px",
  color: "#1b95e0",
  borderRadius: "5px",
  cursor: "pointer",
} as CSSProperties;

interface Props {
  value: string;
  selected?: boolean;
  onClick?: () => void;
}

export default function Hashtag({ value, selected, onClick }: Props) {
  const border = selected ? `1px solid ${FOCUSED_COLOR}` : TITLE_BAR_BORDER;
  const backgroundColor = selected ? "#1990ff" : "#fafafa";
  const color = selected ? "white" : "#1b95e0";

  return (
    <span
      style={{ ...STYLE, border, backgroundColor, color }}
      onClick={onClick}
    >
      #{value}
    </span>
  );
}
