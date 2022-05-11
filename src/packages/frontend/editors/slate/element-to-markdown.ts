/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Element } from "slate";
import { Info, serialize } from "./slate-to-markdown";
import { getChildInfoHook, getSlateToMarkdown } from "./elements";
import stringify from "json-stable-stringify";

export interface ChildInfo extends Info {
  // Child info is like info, but we all any other property -- see
  // https://stackoverflow.com/questions/33836671/typescript-interface-that-allows-other-properties
  // We want this since the getChildInfoHook conveys info to children
  // by setting arbitrary fields of this Info object.
  [field: string]: any;
}

export function serializeElement(node: Element, info: Info): string {
  if (!Element.isElement(node)) {
    // make typescript happier.
    throw Error("BUG -- serializeElement takes an element as input");
  }

  if (
    info.noCache === undefined ||
    info.topLevel === undefined ||
    !info.noCache.has(info.topLevel)
  ) {
    const cachedMarkdown = info.cache?.[stringify(node)];
    if (cachedMarkdown != null) {
      return cachedMarkdown;
    }
  }

  const childInfo = {
    ...info,
    ...{ parent: node },
  } as ChildInfo;

  const childInfoHook = getChildInfoHook(node["type"]);
  if (childInfoHook != null) {
    childInfoHook({ node, childInfo });
  }
  const v: string[] = [];
  for (let index = 0; index < node.children.length; index++) {
    v.push(
      serialize(node.children[index], {
        ...childInfo,
        ...{ index, lastChild: index == node.children.length - 1 },
      })
    );
  }

  let children = v.join("");
  const slateToMarkdown = getSlateToMarkdown(node["type"]);
  const md = slateToMarkdown({ node, children, info, childInfo });
  const hook = info.hook?.(node);
  if (hook !== undefined) {
    return hook(md);
  }
  return md;
}
