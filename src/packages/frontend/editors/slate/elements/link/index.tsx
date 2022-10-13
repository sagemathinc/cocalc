/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { Text } from "slate";
import { register, SlateElement } from "../register";
import { dict } from "@cocalc/util/misc";
import { useFileContext } from "@cocalc/frontend/lib/file-context";

export const LINK_STYLE = {
  backgroundColor: "white",
  padding: "1px",
  margin: "-1px", // so the position isn't changed; important when background is white so doesn't look weird.
  borderRadius: "2px",
} as CSSProperties;

export interface Link extends SlateElement {
  type: "link";
  isInline: true;
  url?: string;
  title?: string;
}

register({
  slateType: "link",

  StaticElement: ({ attributes, children, element }) => {
    const node = element as Link;
    let { url, title } = node;
    const { AnchorTagComponent, urlTransform } = useFileContext();
    if (AnchorTagComponent != null) {
      return (
        <AnchorTagComponent
          {...attributes}
          href={url}
          title={title}
          style={LINK_STYLE}
        >
          {children}
        </AnchorTagComponent>
      );
    }
    let props;
    if (url != null) {
      const isExternal = url.includes("://");
      props = {
        href: urlTransform?.(url, "a") ?? url,
        target: isExternal ? "_blank" : undefined,
        rel: isExternal ? "noopener" : undefined,
      };
    }
    return (
      <a {...attributes} {...props} title={title} style={LINK_STYLE}>
        {children}
        {isBlank(element) && <span contentEditable={false}>(blank link)</span>}
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

function isBlank(element): boolean {
  return (
    element.children.length == 1 &&
    Text.isText(element.children[0]) &&
    !element.children[0].text.trim()
  );
}
