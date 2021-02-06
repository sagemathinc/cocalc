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
import { dict } from "smc-util/misc";
import { FOCUSED_COLOR } from "../util";

export interface Image extends SlateElement {
  type: "image";
  isInline: true;
  isVoid: true;
  src: string;
  alt?: string;
  title?: string;
  width?: string | number;
  height?: string | number;
}

export function toSlate({ type, children, token }) {
  switch (type) {
    // IMPORTANT: this only gets called with type != 'image'
    // because of explicit code in ./html.tsx.
    case "html_inline":
    case "html_block":
      // token.content will be a string like this:
      //    <img src='https://wstein.org/bella-and-william.jpg' width=200px title='my pup' />
      // easiest way to parse this is with jquery (not by hand).
      const elt = $(token.content);
      const node = {
        type: "image",
        children,
        isInline: true,
        isVoid: true,
        src: elt.attr("src") ?? "",
        alt: elt.attr("alt") ?? "",
        title: elt.attr("title") ?? "",
        width: elt.attr("width"),
        height: elt.attr("height"),
      } as any;
      if (type == "html_inline") {
        return node;
      }
      return {
        type: "paragraph",
        children: [{ text: "" }, node, { text: "" }],
      };
    case "image":
      const attrs = dict(token.attrs as any);
      return {
        type: "image",
        children,
        isInline: true,
        isVoid: true,
        src: attrs.src,
        alt: attrs.alt,
        title: attrs.title,
      };
    default:
      throw Error("bug");
  }
}

register({
  slateType: "image",

  fromSlate: ({ node }) => {
    // ![ALT](https://wstein.org/bella-and-william.jpg "title")
    let src = node.src ?? "";
    let alt = node.alt ?? "";
    let title = node.title ?? "";
    let width = node.width;
    let height = node.height;
    if (!width && !height) {
      if (title.length > 0) {
        title = ` \"${title}\"`;
      }
      return `![${alt}](${src}${title})`;
    } else {
      // width or height require using html instead, unfortunately...
      if (width) {
        width = `width="${width}"`;
      }
      if (height) {
        height = `height="${height}"`;
      }
      if (title) {
        title = `title="${title}"`;
      }
      src = `src="${src}"`;
      if (alt) {
        alt = `alt="${alt}"`;
      }
      // Important: this **must** start with '<img ' right now
      // due to our fairly naive parsing code for html blocks.
      return `<img ${src} ${alt} ${width} ${height} ${title}/>`;
    }
  },

  Element: ({ attributes, children, element }) => {
    const node = element as Image;
    const { src, alt, title } = node;

    const focused = useFocused();
    const selected = useSelected();

    const border =
      focused && selected ? `3px solid ${FOCUSED_COLOR}` : `3px solid white`;

    const ref = useProcessLinks([src]);

    return (
      <span {...attributes}>
        <span ref={ref}>
          <img
            contentEditable={false}
            src={src}
            alt={alt}
            title={title}
            style={{
              maxWidth: "100%",
              border,
              height: node.height,
              width: node.width,
            }}
          />
        </span>
        {children}
      </span>
    );
  },

  toSlate,
});
