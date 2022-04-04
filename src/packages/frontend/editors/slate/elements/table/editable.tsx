/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties as CSS } from "react";
import { register } from "../register";
import { useFocused, useSelected } from "../hooks";
import { FOCUSED_COLOR, padLeft, padRight, padCenter } from "../../util";
import { serialize } from "../../slate-to-markdown";

function fromSlate({ node, children, info, childInfo }) {
  switch (node.type) {
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
        const n = (childInfo.table?.[i]?.width ?? 5) - 2;
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
      return "| " + children.trimEnd() + "\n";

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
      children = children.trimEnd();
      return children + " | ";
  }
}

export const Element = ({ attributes, children, element }) => {
  const focused = useFocused();
  const selected = useSelected();
  let backgroundColor: string | undefined = undefined;

  switch (element.type) {
    /* We render *editable* tables using straight HTML and the antd
       CSS classes.  We do NOT use the actual antd Table
       class, since it doesn't play well with slatejs.
       I just looked at the DOM in a debugger to figure out
       these tags; the main risk is that things change, but
       it's purely style so that is OK.
    */

    case "table":
      const border =
        focused && selected ? `1px solid ${FOCUSED_COLOR}` : undefined;
      return (
        <div
          {...attributes}
          className="ant-table"
          style={{ fontSize: "inherit", border }}
        >
          <table style={{ tableLayout: "auto" }}>{children}</table>
        </div>
      );
    case "thead":
      return (
        <thead {...attributes} className="ant-table-thead">
          {children}
        </thead>
      );
    case "tbody":
      return (
        <tbody {...attributes} className="ant-table-tbody">
          {children}
        </tbody>
      );
    case "tr":
      return (
        <tr {...attributes} className="ant-table-row">
          {children}
        </tr>
      );
    case "th":
      backgroundColor = focused && selected ? "#e8f2ff" : undefined;
      return (
        <th
          {...attributes}
          style={{ backgroundColor, textAlign: element.align ?? "left" } as CSS}
          className="ant-table-cell"
        >
          {children}
        </th>
      );
    case "td":
      backgroundColor = focused && selected ? "#e8f2ff" : undefined;
      return (
        <td
          {...attributes}
          style={{ backgroundColor, textAlign: element.align ?? "left" } as CSS}
          className="ant-table-cell"
        >
          {children}
        </td>
      );
    default:
      throw Error("not a table element type " + element.type);
  }
};

register({
  slateType: ["thead", "tbody", "tr", "th", "td"],
  Element,
  fromSlate,
});

// NOTE/OPTIMIZATION: We end up serializing the cells twice; first to
// get their length, then later to do a final render and pad everything
// to look nice.
// table is extra global information used in formatting columns.
type TableInfo = { width: number; align: "left" | "center" | "right" }[];

register({
  slateType: "table",
  Element,
  childInfoHook: ({ childInfo, node }) => {
    const thead_tr = (node as any).children[0].children[0];
    const tbody_rows = (node as any).children[1]?.children ?? []; // can have no tbody
    const info: TableInfo = [];
    const n = thead_tr.children?.length ?? 0;
    for (let i = 0; i < n; i++) {
      info.push({
        width: Math.max(
          3,
          serialize(thead_tr.children[i], {
            parent: thead_tr,
            no_escape: false,
            lastChild: i == n - 1,
          }).length - 3
        ),
        align: thead_tr.children[i].align,
      });
    }
    for (const tr of tbody_rows) {
      const n = tr.children?.length ?? 0;
      for (let i = 0; i < n; i++) {
        if (info[i] == null) continue;
        info[i].width = Math.max(
          info[i].width ?? 3,
          serialize(tr.children[i], {
            parent: tr,
            no_escape: false,
            lastChild: i == n - 1,
          }).length - 3
        );
      }
    }
    childInfo.table = info;
  },
  fromSlate,
});
