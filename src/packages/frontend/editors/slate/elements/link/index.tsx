/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Text } from "slate";
import React from "react";
import { register, SlateElement } from "../register";
import { dict } from "@cocalc/util/misc";

export interface Link extends SlateElement {
  type: "link";
  isInline: true;
  url?: string;
  title?: string;
}

// TODO: need to port over useProcessLinks in a meaningful way...

register({
  slateType: "link",

  StaticElement: ({ attributes, children, element }) => {
    const node = element as Link;
    const { url, title } = node;
    return (
      <a
        {...attributes}
        href={url}
        target={"_blank"}
        rel={"noopener"}
        title={title}
      >
        {children}
        {element.children.length == 1 &&
          Text.isText(element.children[0]) &&
          !element.children[0].text.trim() && (
            <span contentEditable={false}>(blank link)</span>
          )}
      </a>
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
