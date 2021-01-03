/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { escape } from "html-escaper";
import { Node, Text } from "slate";

function serialize(node: Node, info?: { parent: Node; index?: number }) {
  if (Text.isText(node)) {
    return escape(node.text);
  }

  switch (node.type) {
    case "bullet_list":
    case "ordered_list":
      const v: string[] = [];
      for (let i = 0; i < node.children.length; i++) {
        v.push(serialize(node.children[i], { parent: node, index: i }));
      }
      return `${v.join("\n")}\n`;
  }

  const children = node.children
    .map((n) => serialize(n, { parent: node }))
    .join("");

  switch (node.type) {
    case "strong":
      return `**${children}**`;
    case "list_item":
      if (info?.parent == null) {
        return `- ${children}`;
      } else if (info.parent.type == "bullet_list") {
        return `- ${children}`;
      } else if (info.parent.type == "ordered_list") {
        return `${
          (info.index ?? 0) + ((info.parent.attrs as any)?.start ?? 1)
        }. ${children}`;
      }
    case "heading":
      let h = "#";
      for (let n = 1; n < parseInt((node.tag as string).slice(1)); n++) {
        h += "#";
      }
      return `${h} ${children}\n\n`;
    case "paragraph":
      return `${children}\n`;
    default:
      return `${children}\n`;
  }
}

export function slate_to_markdown(data: Node[]): string {
  const r = serialize({ children: data });
  console.log("slate_to_markdown", { data, r });
  return r;
}
