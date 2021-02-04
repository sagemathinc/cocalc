/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register, SlateElement, useProcessLinks } from "./register";
import { dict } from "smc-util/misc";
import { open_new_tab } from "../../../../misc-page";
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
    const url = node.url ?? "";
    let title = node.title ?? "";
    if (title.length > 0) {
      title = ` \"${title}\"`;
    }
    if (title == "" && children == url && linkify.test(url)) {
      // special case where the url is easily parsed by the linkify plugin,
      // and there is no title.
      return url;
    } else {
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
