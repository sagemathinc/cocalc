/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import {
  register,
  SlateElement,
  useFocused,
  useProcessLinks,
  useSelected,
} from "./register";
import { ensure_ends_in_two_newline, FOCUSED_COLOR } from "../util";
import { startswith, endswith } from "smc-util/misc";
import { toSlate as toSlateImage } from "./image";

export interface HtmlInline extends SlateElement {
  type: "html_inline";
  isInline: true;
  isVoid: true;
  html: string;
}

export interface HtmlBlock extends SlateElement {
  type: "html_block";
  isInline: false;
  isVoid: true;
  html: string;
}

function toSlate({ type, token, children }) {
  // Special case of images -- we use a completely different function.
  if (startswith(token.content, "<img ")) {
    return toSlateImage({ type, token, children });
  }
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
  const ref = useProcessLinks([html]);
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
      <div {...attributes} ref={ref}>
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

register({
  slateType: "html_inline",
  toSlate,
  Element,
  fromSlate: ({ node }) => node.html as string,
});

register({
  slateType: "html_block",
  toSlate,
  Element,
  fromSlate: ({ node }) => ensure_ends_in_two_newline(node.html as string),
});
