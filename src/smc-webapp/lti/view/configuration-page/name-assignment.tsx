import * as React from "react";

interface Props {
  default_name?: string;
  style?: React.CSSProperties;
}

export function NameAssignment({
  default_name = "Untitled Assignment",
  style = {
    border: "none",
    fontSize: "1.5rem",
    width: "100%",
    padding: "0.5rem 0.3rem",
    marginBottom: "1rem"
  }
}: Props) {
  return (
    <div>
      <input style={style} placeholder={default_name} />
    </div>
  );
}
