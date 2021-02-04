/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Element, Text } from "slate";
import { serializeLeaf } from "./leaf-to-markdown";
import { serializeElement } from "./element-to-markdown";
//import { trimPaddingFromMarkdown } from "./padding";

export interface Info {
  parent: Node; // the parent of the node being serialized
  index?: number; // index of this node among its siblings
  no_escape: boolean; // if true, do not escape text in this node.
  hook?: (Node, string) => undefined | string;
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
  options?: { no_escape?: boolean; hook?: (Node, string) => undefined | string }
): string {
  // const t = new Date().valueOf();
  const markdown = slate
    .map((node) =>
      serialize(node, {
        parent: node,
        no_escape: !!options?.no_escape,
        hook: options?.hook,
      })
    )
    .join("");
  // not doing this for now, since it is causing more trouble than it is worth...
  // const r = trimPaddingFromMarkdown(r);

  //console.log("time: slate_to_markdown ", new Date().valueOf() - t, "ms");
  //console.log("slate_to_markdown", { slate, markdown });
  return markdown;
}

