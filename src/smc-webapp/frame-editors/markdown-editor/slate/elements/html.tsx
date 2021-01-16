/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register } from "../register";
import { replace_math } from "../util";
import { useFocused, useSelected } from "slate-react";
import { FOCUSED_COLOR } from "../util";

function toSlate({ token, math, children }) {
  return {
    type: token.type,
    isVoid: true,
    isInline: token.type == "html_inline",
    html: replace_math(token.content, math),
    children,
  };
}

function is_br(s: string): boolean {
  const x = s.toLowerCase().replace(/\s/g, "");
  return x == "<br>" || x == "<br/>";
}

const Element = ({ attributes, children, element }) => {
  const focused = useFocused();
  const selected = useSelected();
  const border =
    focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid white`;

  if (element.type == "html_inline") {
    return (
      <span {...attributes}>
        <code style={{ color: "#aaa", border }}>{element.html as string}</code>
        {is_br(element.html as string) && <br />}
        {children}
      </span>
    );
  } else {
    return (
      <div {...attributes}>
        <div
          style={{ border }}
          contentEditable={false}
          dangerouslySetInnerHTML={{ __html: element.html as string }}
        ></div>
        {children}
      </div>
    );
  }
};

const fromSlate = ({ node }) => node.html as string;

register({
  slateType: "html_inline",
  toSlate,
  Element,
  fromSlate,
});

register({
  slateType: "html_block",
  toSlate,
  Element,
  fromSlate,
});
