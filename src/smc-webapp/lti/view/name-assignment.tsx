import * as React from "react";

interface Props {
  default_name?: string;
  style?: React.CSSProperties;
}

export function NameAssignment({
  default_name = "Untitled Assignment",
  style = {
    border: "none",
    backgroundColor: "skyblue",
    fontSize: "26px",
    margin: "10px"
  }
}: Props) {
  return (
    <div>
      <input style={style} placeholder={default_name} />
    </div>
  );
}
