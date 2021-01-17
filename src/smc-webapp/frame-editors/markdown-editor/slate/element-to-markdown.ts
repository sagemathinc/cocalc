/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node, Text } from "slate";
import { Info, serialize } from "./slate-to-markdown";
import { getChildInfoHook, getSlateToMarkdown } from "./register";

export interface ChildInfo extends Info {
  // Child info is like info, but we all any other property -- see
  // https://stackoverflow.com/questions/33836671/typescript-interface-that-allows-other-properties
  // We want this since the getChildInfoHook conveys info to children
  // by setting arbitrary fields of this Info object.
  [field: string]: any;
}

export function serializeElement(node: Node, info: Info): string {
  if (Text.isText(node)) {
    // make typescript happier.
    throw Error("BUG -- do not pass Text objects to serializeElement");
  }

  const childInfo = {
    ...info,
    ...{ parent: node },
  } as ChildInfo;

  const hook = getChildInfoHook(node.type as string);
  if (hook != null) {
    hook({ node, childInfo });
  }
  const v: string[] = [];
  for (let index = 0; index < node.children.length; index++) {
    v.push(serialize(node.children[index], { ...childInfo, ...{ index } }));
  }
  let children = v.join("");
  const slateToMarkdown = getSlateToMarkdown(node.type as string);
  return slateToMarkdown({ node, children, info, childInfo });
}
