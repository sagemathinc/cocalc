/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Text } from "slate";
import { getChildInfoHook, getSlateToMarkdown } from "./register";
import { serializeLeaf } from "./leaf-to-markdown";

export interface Info {
  parent: Node; // the parent of the node being serialized
  index?: number; // index of this node among its siblings
  no_escape: boolean; // if true, do not escape text in this node.
}

export interface ChildInfo extends Info {
  // Child info is like info, but we all any other property -- see
  // https://stackoverflow.com/questions/33836671/typescript-interface-that-allows-other-properties
  // We want this since the getChildInfoHook conveys info to children
  // by setting arbitrary fields of this Info object.
  [field: string]: any;
}

function serializeElement(node: Node, info: Info): string {
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

export function serialize(node: Node, info: Info): string {
  if (Text.isText(node)) {
    return serializeLeaf(node, info);
  } else {
    return serializeElement(node, info);
  }
}

export function slate_to_markdown(
  data: Node[],
  options?: { no_escape?: boolean }
): string {
  const r = data
    .map((node) =>
      serialize(node, { parent: node, no_escape: !!options?.no_escape })
    )
    .join("");
  return r;
}
