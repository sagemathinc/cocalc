import * as React from "react";

const { Space, Icon } = require("../../r_misc");
const { Button } = require("react-bootstrap");

export function CopyButton({ on_click }) {
  return (
    <span>
      <Space />
      <Button bsStyle="info" bsSize="xsmall" onClick={on_click}>
        <Icon name="files-o" /> <span className="hidden-xs">Copy</span>
      </Button>
    </span>
  );
}
