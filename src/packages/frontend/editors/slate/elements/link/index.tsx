/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Text } from "slate";
import { register, SlateElement } from "../register";
import { dict } from "@cocalc/util/misc";
import { useFileContext } from "@cocalc/frontend/lib/file-context";

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
        <AnchorTagComponent {...attributes} href={url} title={title}>
          {children}
        </AnchorTagComponent>
      );
    }
    let props;
    if (url != null) {
      url = urlTransform?.(url) ?? url;
      const isExternal = url?.includes("://");
      props = {
        href: url,
        target: isExternal ? "_blank" : undefined,
        rel: isExternal ? "noopener" : undefined,
      };
    }

    return (
      <a {...attributes} {...props} title={title}>
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
