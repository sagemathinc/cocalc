/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Element } from "slate";
import { register, SlateElement, RenderElementProps } from "../register";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "./info-to-mode";

export interface CodeBlock extends SlateElement {
  type: "code_block";
  isVoid: true;
  fence: boolean;
  value: string;
  info: string;
}

const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  if (element.type != "code_block") throw Error("bug");
  return (
    <div {...attributes} style={{ marginBottom: "1em" }}>
      <CodeMirrorStatic
        value={element.value}
        style={{ background: "#f7f7f7" }}
        options={{ mode: infoToMode(element.info) }}
      />
    </div>
  );
};

function toSlate({ token }) {
  // fence =block of code with ``` around it, but not indented.
  let value = token.content;
  // We remove the last carriage return (right before ```), since it
  // is much easier to do that here...
  if (value[value.length - 1] == "\n") {
    value = value.slice(0, value.length - 1);
  }
  const info = token.info ?? "";
  if (typeof info != "string") {
    throw Error("info must be a string");
  }
  return {
    type: "code_block",
    isVoid: true,
    fence: token.type == "fence",
    value,
    info,
    children: [{ text: "" }],
  } as Element;
}

function sizeEstimator({ node, fontSize }): number {
  return node.value.split("\n").length * (fontSize + 2) + 10 + fontSize;
}

register({
  slateType: "code_block",
  markdownType: ["fence", "code_block"],
  StaticElement,
  toSlate,
  sizeEstimator,
});
