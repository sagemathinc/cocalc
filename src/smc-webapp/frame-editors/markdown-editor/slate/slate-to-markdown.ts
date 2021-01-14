/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Text } from "slate";
import {
  ensure_ends_in_newline,
  indent,
  li_indent,
  mark_block,
  mark_inline_text,
  markdown_escape,
  markdown_quote,
} from "./util";
const linkify = require("linkify-it")();
import { startswith } from "smc-util/misc";

function serialize(
  node: Node,
  info: { parent: Node; index?: number; no_escape: boolean }
): string {
  //console.log("serialize", node);
  if (Text.isText(node)) {
    //console.log("  serialize as text", node);
    let text = node.text;
    if (!info.no_escape && !node.code && info.parent.type != "code_block") {
      text = markdown_escape(text);
    }

    const marks: { left: string; right?: string }[] = [];
    // Proper markdown annotation.
    if (node.bold) {
      marks.push({ left: "**" });
    }
    if (node.italic) {
      marks.push({ left: "_" });
    }
    if (node.strikethrough) {
      marks.push({ left: "~~" });
    }
    if (node.code) {
      marks.push({ left: "`" });
    }

    // Using html to provide some things markdown doesn't provide,
    // but they can be VERY useful in practice for our users.
    if (node.underline) {
      marks.push({ left: "<u>", right: "</u>" });
    }
    for (const c of ["sup", "sub"]) {
      if (node[c]) {
        marks.push({ left: `<${c}>`, right: `</${c}>` });
      }
    }
    // colors and fonts
    for (const mark in node) {
      if (!node[mark]) continue; // only if true
      for (const c of ["color", "font-family", "font-size"]) {
        if (startswith(mark, `${c}:`)) {
          marks.push({
            left: `<span style='${mark}'>`,
            right: "</span>",
          });
        }
      }
    }
    for (const mark of marks) {
      text = mark_inline_text(text, mark.left, mark.right);
    }
    return text;
  }

  switch (node.type) {
    case "bullet_list":
    case "ordered_list":
      // console.log("  serializing as list", node);
      const v: string[] = [];
      for (let i = 0; i < node.children.length; i++) {
        v.push(
          ensure_ends_in_newline(
            serialize(node.children[i], {
              parent: node,
              index: i,
              no_escape: info.no_escape,
            })
          )
        );
      }
      let s = v.join("");
      if (s[s.length - 2] != "\n" && info.parent.type != "list_item") {
        // lists should end with two new lines, unless parent is a list item itself.
        s += "\n";
      }
      return s;
  }

  const children = node.children
    .map((n) => serialize(n, { parent: node, no_escape: info.no_escape }))
    .join("");

  switch (node.type) {
    case "list_item":
      if (info?.parent == null) {
        return li_indent(`- ${children}`);
      } else if (info.parent.type == "bullet_list") {
        return li_indent(`- ${children}`);
      } else if (info.parent.type == "ordered_list") {
        return li_indent(
          `${
            (info.index ?? 0) + ((info.parent.attrs as any)?.start ?? 1)
          }. ${children}`
        );
      } else {
        // Unknown list type??
        return children;
      }
    case "heading":
      let h = "\n#";
      for (let n = 1; n < (node.level as any); n++) {
        h += "#";
      }
      return mark_block(children, h).trim() + "\n\n";
    case "paragraph":
      return `${children}${node.tight ? "\n" : "\n\n"}`;
    case "softbreak":
      return "\n";
    case "hardbreak":
      return "  \n";
    case "math":
      return node.value as string;
    case "checkbox":
      return `[${node.checked ? "x" : " "}]`;
    case "hr":
      return "\n---\n\n";
    case "html_block":
      return node.html as string;
    case "blockquote":
      return markdown_quote(children);
    case "html_inline":
      return node.html as string;
    case "emoji":
      return `:${node.markup}:`;
    case "link":
      // [my website](wstein.org "here")
      const attrs = (node as any).attrs;
      const href = attrs.href ? `${attrs.href}` : "";
      const title = attrs.title ? ` "${attrs.title}"` : "";
      let link;
      if (title == "" && children == href && linkify.test(href)) {
        // special case where the url is easily parsed by the linkify plugin.
        link = href;
      } else {
        link = `[${children}](${href}${title})`;
      }
      return link;
    case "code_block":
      const value = node.value as string;
      if (node.fence) {
        const info = node.info ?? "";
        // There is one special case with fenced codeblocks that we
        // have to worry about -- if they contain ```, then we need
        // to wrap with *more* than the max sequence of backticks
        // actually in the codeblock!   See
        //    https://stackoverflow.com/questions/49267811/how-can-i-escape-3-backticks-code-block-in-3-backticks-code-block
        // for an excellent discussion of this, and also
        // https://github.com/mwouts/jupytext/issues/712
        let fence = "```";
        while (value.indexOf(fence) != -1) {
          fence += "`";
        }
        return (
          fence + info + "\n" + ensure_ends_in_newline(value) + fence + "\n\n"
        );
      } else {
        return indent(ensure_ends_in_newline(value), 4) + "\n";
      }

    case "table": // a table
      const i = children.indexOf("\n");
      const thead = children.slice(0, i);
      const tbody = children.slice(i + 1);
      let sep = "|",
        headings: { align: string }[];
      try {
        headings = (node as any).children[0].children[0].children;
      } catch (_err) {
        headings = [];
      }
      for (let i = 0; i < headings.length; i++) {
        let bar = "---";
        switch (headings[i].align) {
          case "left":
            bar = ":---";
            break;
          case "center":
            bar = ":---:";
            break;
          case "right":
            bar = "---:";
            break;
        }
        sep += ` ${bar} |`;
      }
      return `${thead}\n${sep}\n${tbody}\n`;

    case "thead": // the heading row of a table
      return children; // the one child is a tr, which renders fine by itself

    case "tbody": // the body of the table
      return children;

    case "tr": // a row of a table
      return "| " + children.trim() + "\n";

    case "th": // a heading entry in a row in the thead
      return children + " | ";

    case "td": // a data entry in a row
      return children + " | ";

    default:
      // console.log("WARNING: serialize Node as UNKNOWN", { node, children });
      return `${children}\n`;
  }
}

export function slate_to_markdown(
  data: Node[],
  options?: { no_escape?: boolean }
): string {
  //console.log("slate_to_markdown", JSON.stringify(data, undefined, 2));
  const r = data
    .map((node) =>
      serialize(node, { parent: node, no_escape: !!options?.no_escape })
    )
    .join("");
  return r;
}
