/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Text } from "slate";
import { replace_all } from "smc-util/misc";

function serialize(
  node: Node,
  info?: { parent: Node; index?: number }
): string {
  console.log(Text.isText(node), node);
  if (Text.isText(node)) {
    let text = node.text;
    text = replace_all(text, "$", "\\$");
    if (node.bold) {
      text = `**${text}**`;
    }
    if (node.italic) {
      text = `_${text}_`;
    }
    if (node.underline) {
      text = `<u>${text}</u>`;
    }
    if (node.strikethrough) {
      text = `~~${text}~~`;
    }
    return text;
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
      return `${children}\n\n`;
    case "math":
      return node.value as string;
    case "hr":
      return "---\n\n";
    case "html_block":
      return node.html as string;
    case "html_inline":
      return node.html as string;
    default:
      return `${children}\n`;
  }
}

export function slate_to_markdown(data: Node[]): string {
  const r = serialize({ children: data });
  console.log("slate_to_markdown", { data, r });
  (window as any).y = { doc: { ...data }, r };
  return r;
}
