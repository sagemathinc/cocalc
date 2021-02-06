/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState } from "../../../../app-framework";
import {
  register,
  SlateElement,
  useFocused,
  useProcessLinks,
  useSelected,
  useSlate,
} from "./register";
import { ensure_ends_in_two_newline, FOCUSED_COLOR } from "../util";
import { startswith /*endswith*/ } from "smc-util/misc";
import { toSlate as toSlateImage } from "./image";
import { SlateCodeMirror } from "./codemirror";
import { Transforms } from "slate";

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
  // Special case of images (one line, img tag);
  // we use a completely different function.
  if (
    startswith(token.content, "<img ") &&
    token.content.trim().split("\n").length <= 1
  ) {
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
  // this feels ugly in practice, and we have the source so not doing it.
  const is_comment = false;
  // const is_comment = startswith(html, "<!--") && endswith(html, "-->");

  // mode for editing the raw html
  const [editMode, setEditMode] = useState<boolean>(false);
  const editor = useSlate();
  function renderEditMode() {
    if (!editMode) return;
    return (
      <div style={{ boxShadow: "8px 8px 4px #888" }}>
        <SlateCodeMirror
          value={html}
          onChange={(html) => {
            Transforms.setNodes(editor, { html } as any, {
              match: (node) =>
                node["type"] == "html_block" || node["type"] == "html_inline",
            });
          }}
          onBlur={() => setEditMode(false)}
          info="html"
          options={{
            lineWrapping: true,
            autofocus: true,
            autoCloseTags: true,
            smartIndent: true,
          }}
          isInline={element["type"] == "html_inline"}
        />
      </div>
    );
  }

  if (element.type == "html_inline") {
    return (
      <span {...attributes}>
        {renderEditMode()}
        <code
          style={{ color: is_comment ? "#a50" : "#aaa", border }}
          onClick={() => {
            setEditMode(true);
          }}
        >
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
    return (
      <div {...attributes}>
        <div
          style={{ border }}
          contentEditable={false}
          onDoubleClick={() => {
            setEditMode(true);
          }}
        >
          {renderEditMode()}
          <div ref={ref} dangerouslySetInnerHTML={{ __html: html }}></div>
        </div>
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
