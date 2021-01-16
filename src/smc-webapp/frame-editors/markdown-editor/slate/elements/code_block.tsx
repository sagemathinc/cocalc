/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps, useSlate } from "slate-react";
import { Transforms } from "slate";
import { register } from "../register";
import { SlateCodeMirror } from "../codemirror";
import { ensure_ends_in_newline, indent, replace_math } from "../util";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const editor = useSlate();

  return (
    <div {...attributes}>
      <SlateCodeMirror
        value={element.value as string}
        info={element.info as string | undefined}
        onChange={(value) => {
          Transforms.setNodes(
            editor,
            { value },
            { match: (node) => node.type == "code_block" }
          );
        }}
      />
      {children}
    </div>
  );
};

function toSlate({ token, children, math }) {
  // fence =block of code with ``` around it, but not indented.
  // Put any math we removed back in unchanged (since the math parsing doesn't
  // know anything about code blocks, and doesn't know to ignore them).
  let value = replace_math(token.content, math);
  // We also remove the last carriage return (right before ```), since it
  // is much easier to do that here...
  value = value.slice(0, value.length - 1);
  return {
    isVoid: true,
    type: "code_block",
    fence: token.type == "fence",
    value,
    info: token.info,
    children,
  };
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
