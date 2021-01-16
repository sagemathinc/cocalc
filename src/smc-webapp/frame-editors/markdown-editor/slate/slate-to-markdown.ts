/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Text } from "slate";
import {
  ensure_ends_in_newline,
  li_indent,
  mark_block,
  mark_inline_text,
  markdown_escape,
  markdown_quote,
  padLeft,
  padRight,
  padCenter,
} from "./util";
const linkify = require("linkify-it")();
import { startswith } from "smc-util/misc";
import { getSlateToMarkdown } from "./register";

// table is extra global information used in formatting columns.
type TableInfo = { width: number; align: "left" | "center" | "right" }[];

interface Info {
  parent: Node; // the parent of the node being serialized
  index?: number; // index of this node among its siblings
  no_escape: boolean; // if true, do not escape text in this node.
  table?: TableInfo;
}

function serialize(node: Node, info: Info): string {
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

  const child_info = {
    ...info,
    ...{ parent: node },
  } as Info;
  if (node.type == "table") {
    child_info.table = extract_table_info(node);
  }

  const v: string[] = [];
  for (let index = 0; index < node.children.length; index++) {
    v.push(serialize(node.children[index], { ...child_info, ...{ index } }));
  }
  let children = v.join("");

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
    case "html_block":
      return node.html as string;
    case "blockquote":
      return markdown_quote(children);
    case "html_inline":
      return node.html as string;
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
        const n = (child_info.table?.[i]?.width ?? 5) - 2;
        let bar = "-";
        for (let j = 0; j < n; j++) bar += "-";
        switch (headings[i].align) {
          case "center":
            bar = ":" + bar.slice(1) + ":";
            break;
          case "right":
            bar = bar + ":";
            break;
          case "left":
          default:
            bar = ":" + bar;
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
    case "td": // a data entry in a row
      if (info.index != null) {
        const data = info.table?.[info.index];
        if (data != null) {
          switch (data.align) {
            case "left":
              children = padRight(children, data.width);
              break;
            case "right":
              children = padLeft(children, data.width);
              break;
            case "center":
              children = padCenter(children, data.width);
              break;
          }
        }
      }
      return children + " | ";

    default:
      const slateToMarkdown = getSlateToMarkdown(node.type as string);
      if (slateToMarkdown != null) {
        return slateToMarkdown({ node, children });
      }

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

// NOTE/OPTIMIZATION: We end up serializing the cells twice; first to
// get their length, then later to do a final render and pad everything
// to look nice.
function extract_table_info(node: Node): TableInfo {
  const thead_tr = (node as any).children[0].children[0];
  const tbody_rows = (node as any).children[1]?.children ?? []; // can have no tbody
  const info: TableInfo = [];
  for (let i = 0; i < thead_tr.children?.length ?? 0; i++) {
    info.push({
      width: Math.max(
        3,
        serialize(thead_tr.children[i], {
          parent: thead_tr,
          no_escape: false,
        }).length - 3
      ),
      align: thead_tr.children[i].align,
    });
  }
  for (const tr of tbody_rows) {
    for (let i = 0; i < tr.children?.length ?? 0; i++) {
      info[i].width = Math.max(
        info[i]?.width ?? 3,
        serialize(tr.children[i], {
          parent: tr,
          no_escape: false,
        }).length - 3
      );
    }
  }
  return info;
}
