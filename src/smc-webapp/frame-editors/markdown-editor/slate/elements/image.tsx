/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRef, useState } from "../../../../app-framework";
import {
  register,
  SlateElement,
  useFocused,
  useProcessLinks,
  useSelected,
  useSlate,
} from "./register";
import { useSetElement } from "./set-element";
import { dict } from "smc-util/misc";
import { FOCUSED_COLOR } from "../util";
import { Resizable } from "re-resizable";

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
    if (!width && !height && !src.match(/\s/)) {
      // no width, no height and src has no spaces in it!
      // Our markdown processes doesn't work when the
      // image url has a space (or at least it is a pain
      // to escape it), and using quotes doesn't easily
      // workaround that so we just use an img take when
      // src has whitespace (below).
      if (title.length > 0) {
        title = ` \"${title}\"`;
      }
      return `![${alt}](${src}${title})`;
    } else {
      // width or height require using html instead, unfortunately...
      width = width ? ` width="${width}"` : "";
      height = height ? ` height="${height}"` : "";
      title = title ? ` title="${title}"` : "";
      src = src ? `src="${src}"` : "";
      alt = alt ? ` alt="${alt}"` : "";
      // Important: this **must** start with '<img ' right now
      // due to our fairly naive parsing code for html blocks.
      return `<img ${src} ${alt} ${width} ${height} ${title}/>`;
    }
  },

  Element: ({ attributes, children, element }) => {
    const node = element as Image;
    const { src, alt, title } = node;

    const [width, setWidth] = useState<number | undefined>(undefined);
    const [height, setHeight] = useState<number | undefined>(undefined);

    const focused = useFocused();
    const selected = useSelected();
    const border = `2px solid ${focused && selected ? FOCUSED_COLOR : "white"}`;

    const ref = useProcessLinks([src]);
    const imageRef = useRef<any>(null);

    const editor = useSlate();
    const setElement = useSetElement(editor, element);

    return (
      <span {...attributes}>
        <span ref={ref} contentEditable={false}>
          <Resizable
            maxWidth="100%"
            style={{
              display: "inline-block",
              background: "#f0f0f0",
              border,
            }}
            lockAspectRatio={true}
            size={
              width != null && height != null
                ? {
                    width,
                    height,
                  }
                : undefined
            }
            onResizeStop={(_e, _direction, _ref, d) => {
              if (width == null || height == null) return;
              const new_width = width + d.width;
              const new_height = height + d.height;
              setElement({
                height: `${new_height}px`,
                width: `${new_width}px`,
              });
              setWidth(new_width);
              setHeight(new_height);
            }}
          >
            <img
              onLoad={() => {
                const elt = $(imageRef.current);
                const width = elt.width() ?? 0;
                const height = elt.height() ?? 0;
                setWidth(width);
                setHeight(height);
              }}
              ref={imageRef}
              src={src}
              alt={alt}
              title={title}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                height: node.height,
                width: node.width,
              }}
            />
          </Resizable>
        </span>
        {children}
      </span>
    );
  },

  toSlate,
});
