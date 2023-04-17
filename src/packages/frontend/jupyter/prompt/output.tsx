import React from "react";
import { OutputPromptProps, OUTPUT_STYLE } from "./base";
import { HiddenXS } from "@cocalc/frontend/components/hidden-visible";

export const OutputPrompt: React.FC<OutputPromptProps> = (props) => {
  let n;
  if (props.collapsed || !props.exec_count) {
    n = undefined;
  } else {
    n = props.exec_count != null ? props.exec_count : " ";
  }
  return (
    <HiddenXS>
      {n == null ? (
        <div style={OUTPUT_STYLE} />
      ) : (
        <div style={OUTPUT_STYLE}>Out[{n}]:</div>
      )}
    </HiddenXS>
  );
};
