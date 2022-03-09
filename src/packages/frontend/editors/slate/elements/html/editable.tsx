/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";
import { register } from "../register";
import { useFocused, useProcessLinks, useSelected, useSlate } from "../hooks";
import { ensure_ends_in_two_newline, FOCUSED_COLOR } from "../../util";
import { SlateCodeMirror } from "../codemirror";
import { useSetElement } from "../set-element";

function isBR(s: string): boolean {
  const x = s.toLowerCase().replace(/\s/g, "");
  return x == "<br>" || x == "<br/>";
}

const Element = ({ attributes, children, element }) => {
  const focused = useFocused();
  const selected = useSelected();
  const border =
    focused && selected
      ? `1px solid ${FOCUSED_COLOR}`
      : `1px solid transparent`;
  const html = ((element.html as string) ?? "").trim();
  const ref = useProcessLinks([html]);
  // this feels ugly in practice, and we have the source so not doing it.
  const is_comment = false;
  // const is_comment = html.startsWith("<!--") && html.endsWith("-->");

  // mode for editing the raw html
  const [editMode, setEditMode] = useState<boolean>(false);
  const editor = useSlate();

  const setElement = useSetElement(editor, element);

  function renderEditMode() {
    if (!editMode) return;
    return (
      <div style={{ boxShadow: "8px 8px 4px #888" }}>
        <SlateCodeMirror
          value={html}
          onChange={(html) => {
            setElement({ html });
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
        {isBR(html) && <br />}
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
          <div ref={ref} dangerouslySetInnerHTML={{ __html: html }}></div>
          {renderEditMode()}
        </div>
        {children}
      </div>
    );
  }
};

register({
  slateType: "html_inline",
  Element,
  fromSlate: ({ node }) => node.html as string,
});

register({
  slateType: "html_block",
  Element,
  fromSlate: ({ node }) => ensure_ends_in_two_newline(node.html as string),
});
