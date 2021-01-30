/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { Element as Element0, Transforms } from "slate";
import {
  register,
  SlateElement,
  RenderElementProps,
  useSlate,
} from "./register";
import { SlateCodeMirror } from "./codemirror";
import { ensure_ends_in_newline, indent } from "../util";

export interface CodeBlock extends SlateElement {
  type: "code_block";
  isVoid: true;
  fence: boolean;
  value: string;
  info: string;
}

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "code_block") throw Error("bug");
  const editor = useSlate();

  return (
    <div {...attributes}>
      <SlateCodeMirror
        options={{ lineWrapping: true /*, lineNumbers: true*/ }}
        value={element.value}
        info={element.info}
        onChange={(value) => {
          Transforms.setNodes(editor, { value } as any, {
            match: (node) => node["type"] == "code_block",
          });
        }}
      />
      {children}
    </div>
  );
};

function toSlate({ token, children }) {
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
    children,
  } as Element0;
}

function fromSlate({ node }) {
  const value = node.value as string;
  if (node.fence) {
    const info = node.info.trim() ?? "";
    // There is one special case with fenced codeblocks that we
    // have to worry about -- if they contain ```, then we need
    // to wrap with *more* than the max sequence of backticks
    // actually in the codeblock!   See
    //    https://stackoverflow.com/questions/49267811/how-can-i-escape-3-backticks-code-block-in-3-backticks-code-block
    // for an excellent discussion of this, and also
    // https://github.com/mwouts/jupytext/issues/712
    let fence = "```";
    while (value.indexOf(fence) != -1) {
      fence += "`";
    }
    return fence + info + "\n" + ensure_ends_in_newline(value) + fence + "\n\n";
  } else {
    return indent(ensure_ends_in_newline(value), 4) + "\n";
  }
}

register({
  slateType: "code_block",
  markdownType: ["fence", "code_block"],
  fromSlate,
  Element,
  toSlate,
});
