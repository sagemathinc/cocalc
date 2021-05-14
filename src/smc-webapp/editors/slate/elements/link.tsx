/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Text } from "slate";
import { React } from "app-framework";
import { register, SlateElement, useProcessLinks } from "./register";
import { dict } from "smc-util/misc";
import { open_new_tab } from "misc-page";
const linkify = require("linkify-it")();

export interface Link extends SlateElement {
  type: "link";
  isInline: true;
  url?: string;
  title?: string;
}

register({
  slateType: "link",

  fromSlate: ({ node, children }) => {
    // [my website](wstein.org "here")
    let url = node.url ?? "";
    let title = node.title ?? "";
    if (title.length > 0) {
      title = ` \"${title}\"`;
    }
    if (title == "" && children == url && linkify.test(url)) {
      // special case where the url is easily parsed by the linkify plugin,
      // and there is no title.
      return url;
    } else {
      if (/\s/.test(url)) {
        // See https://superuser.com/questions/1170654/how-do-i-add-a-hyperlink-with-spaces-in-it-using-markdown
        url = `<${url}>`;
      }
      return `[${children}](${url}${title})`;
    }
  },

  Element: ({ attributes, children, element }) => {
    const node = element as Link;
    const { url, title } = node;
    const ref = useProcessLinks([url]);
    return (
      <span {...attributes}>
        <span ref={ref}>
          <a
            href={url}
            title={title}
            onClick={() => {
              if (url) {
                open_new_tab(url);
              }
            }}
          >
            {children}
            {element.children.length == 1 &&
              Text.isText(element.children[0]) &&
              !element.children[0].text.trim() && (
                <span contentEditable={false}>(blank link)</span>
              )}
          </a>
        </span>
      </span>
    );
  },

  toSlate: ({ type, children, state }) => {
    const attrs = dict(state.attrs as any);
    return {
      type,
      children,
      isInline: true,
      url: attrs.href,
      title: attrs.title,
    };
  },
});

// This is a workaround for https://github.com/ianstormtaylor/slate/issues/3772
import { Editor, Element, Path, Range, Transforms } from "slate";

export const withInsertBreakHack = (editor) => {
  const { insertBreak } = editor;

  editor.insertBreak = () => {
    const [selectedElement, path] = Editor.parent(editor, editor.selection);

    if (Element.isElement(selectedElement) && selectedElement.type === "link") {
      const endPoint = Range.end(editor.selection);
      const [selectedLeaf] = Editor.node(editor, endPoint);
      if (
        Text.isText(selectedLeaf) &&
        selectedLeaf.text.length === endPoint.offset
      ) {
        if (Range.isExpanded(editor.selection)) {
          Transforms.delete(editor);
        }
        Transforms.select(editor, Path.next(path));
      }
    }
    insertBreak();
  };

  return editor;
};
