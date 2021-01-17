/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register } from "../register";
import { FOCUSED_COLOR } from "../util";
import { useFocused, useSelected } from "slate-react";
import { startswith, endswith } from "smc-util/misc";

function toSlate({ token, children }) {
  return {
    type: token.type,
    isVoid: true,
    isInline: token.type == "html_inline",
    html: token.content,
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
  const html = ((element.html as string) ?? "").trim();
  const is_comment = startswith(html, "<!--") && endswith(html, "-->");

  if (element.type == "html_inline") {
    return (
      <span {...attributes}>
        <code style={{ color: is_comment ? "#a50" : "#aaa", border }}>
          {html}
        </code>
        {is_br(html) && <br />}
        {children}
      </span>
    );
  } else {
    if (is_comment) {
      return (
        <div {...attributes}>
          <div style={{ color: "#a50" }}>{html}</div>
          {children}
        </div>
      );
    }
    // for userSelect below, see
    // https://github.com/ianstormtaylor/slate/issues/3723#issuecomment-761566218
    return (
      <div {...attributes}>
        <div
          style={{
            border,
            userSelect: "none",
          }}
          contentEditable={false}
          dangerouslySetInnerHTML={{ __html: html }}
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
