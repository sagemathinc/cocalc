import * as React from "react";

const default_style: React.CSSProperties = {
  minHeight: "20px",
  padding: "19px",
  marginBottom: "20px",
  backgroundColor: "#f5f5f5",
  border: " 1px solid #e3e3e3",
  borderRadius: "4px",
  boxShadow: "inset 0 1px 1px rgba(0,0,0,.05)"
} as const;

export function Well(props) {
  const well_style: React.CSSProperties = Object.Assign(
    {},
    default_style,
    props.style
  );

  return (
    <div style={well_style} {...props}>
      {props.children}
    </div>
  );
}
