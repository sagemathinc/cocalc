import * as React from "react";

const { Button } = require("react-bootstrap");

const style: React.CSSProperties = {
  padding: "0px 5px"
};

export function DifferentProjectButton({ on_click }) {
  return (
    <Button bsSize="large" onClick={on_click} style={style}>
      A Different Project
    </Button>
  );
}
