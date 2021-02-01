/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register, SlateElement, useFocused, useSelected } from "./register";
import { dict } from "smc-util/misc";
import { FOCUSED_COLOR } from "../util";

export interface Image extends SlateElement {
  type: "image";
  isInline: true;
  isVoid: true;
  src: string;
  alt?: string;
  title?: string;
  width?: string;
  height?: string;
}

register({
  slateType: "image",

  fromSlate: ({ node }) => {
    // ![ALT](https://wstein.org/bella-and-william.jpg "title")
    const src = node.src ?? "";
    const alt = node.alt ?? "";
    let title = node.title ?? "";
    if (title.length > 0) {
      title = ` \"${title}\"`;
    }
    return `![${alt}](${src}${title})`;
  },

  Element: ({ attributes, children, element }) => {
    const node = element as Image;
    const { src, alt, title } = node;

    const focused = useFocused();
    const selected = useSelected();

    const border =
      focused && selected ? `3px solid ${FOCUSED_COLOR}` : `3px solid white`;

    return (
      <span {...attributes}>
        <img
          contentEditable={false}
          src={src}
          alt={alt}
          title={title}
          style={{ maxWidth: "100%", border }}
        />
        {children}
      </span>
    );
  },

  toSlate: ({ type, children, token }) => {
    const attrs = dict(token.attrs as any);
    return {
      type,
      children,
      isInline: true,
      isVoid: true,
      src: attrs.src,
      alt: attrs.alt,
      title: attrs.title,
    };
  },
});
