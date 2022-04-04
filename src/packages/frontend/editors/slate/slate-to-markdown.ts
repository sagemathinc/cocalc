/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Element, Text } from "slate";
import { serializeLeaf } from "./leaf-to-markdown";
import { serializeElement } from "./element-to-markdown";

export interface Info {
  parent?: Node; // the parent of the node being serialized (if there is a parent)
  index?: number; // index of this node among its siblings
  no_escape: boolean; // if true, do not escape text in this node.
  hook?: (Node) => undefined | ((string) => string);
  lastChild: boolean; // true if this is the last child among its siblings.
  cache?;
  noCache?: Set<number>; // never use cache for these top-level nodes
  topLevel?: number; // top-level block that contains this node.
}

export function serialize(node: Node, info: Info): string {
  if (Text.isText(node)) {
    return serializeLeaf(node, info);
  } else if (Element.isElement(node)) {
    return serializeElement(node, info);
  } else {
    throw Error(
      `bug:  node must be Text or Element -- ${JSON.stringify(node)}`
    );
  }
}

export function slate_to_markdown(
  slate: Node[],
  options?: {
    no_escape?: boolean;
    hook?: (Node) => undefined | ((string) => string);
    cache?;
    noCache?: Set<number>;
  }
): string {
  // const t = new Date().valueOf();

  let markdown = "";
  for (let i = 0; i < slate.length; i++) {
    markdown += serialize(slate[i], {
      no_escape: !!options?.no_escape,
      hook: options?.hook,
      index: i,
      topLevel: i,
      lastChild: i == slate.length - 1,
      cache: options?.cache,
      noCache: options?.noCache,
    });
  }

  //console.log("time: slate_to_markdown ", new Date().valueOf() - t, "ms");
  //console.log("slate_to_markdown", { slate, markdown });
  return markdown;
}
