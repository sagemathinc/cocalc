import React from "react";
import { OutputPromptProps, OUTPUT_STYLE } from "./base";

export const OutputPrompt: React.FC<OutputPromptProps> = (props) => {
  let n;
  if (props.collapsed || !props.exec_count) {
    n = undefined;
  } else {
    n = props.exec_count != null ? props.exec_count : " ";
  }
  if (n == null) {
    return <div style={OUTPUT_STYLE} />;
  }
  return <div style={OUTPUT_STYLE}>Out[{n}]:</div>;
};
