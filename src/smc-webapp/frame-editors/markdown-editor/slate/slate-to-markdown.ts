/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { escape } from "html-escaper";
import { Node, Text } from "slate";

function serialize(node: Node) {
  if (Text.isText(node)) {
    return escape(node.text);
  }

  switch (node.type) {
    case "bullet_list":
      const children = node.children.map((n) => serialize(n)).join("\n");
      return children;
  }

  const children = node.children.map((n) => serialize(n)).join("");

  switch (node.type) {
    case "strong":
      return `**${children}**`;
    case "list_item":
      return `- ${children}`;
    case "bullet_list":
      return children;
    case "heading":
      let h = "#";
      for (let n = 1; n < parseInt((node.tag as string).slice(1)); n++) {
        h += "#";
      }
      return `${h} ${children}\n`;
    case "paragraph":
      return children + "\n";
    default:
      return children;
  }
}

export function slate_to_markdown(data: Node[]): string {
  const r = serialize({ children: data });

  (window as any).y = { serialize, data: JSON.stringify(data), r };
  console.log("slate_to_markdown", (window as any).y);

  return r;
}
