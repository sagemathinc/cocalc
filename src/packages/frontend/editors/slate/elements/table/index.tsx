/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { CSSProperties as CSS } from "react";
import { register, SlateElement } from "../register";

export interface Table extends SlateElement {
  type: "table";
}

export interface THead extends SlateElement {
  type: "thead";
}

export interface TBody extends SlateElement {
  type: "tbody";
}

export interface TR extends SlateElement {
  type: "tr";
}

export interface TH extends SlateElement {
  type: "th";
  align: "left" | "center" | "right";
}

export interface TD extends SlateElement {
  type: "td";
  align: "left" | "center" | "right";
}

function toSlate({ type, children, isEmpty, state }) {
  if (type == "tbody" && isEmpty) {
    // Special case -- if there are no children, do NOT include
    // the tbody either in the slatejs document.
    // In markdown a table can have 0 rows, but
    // this is not possible to *render* in slatejs, due to
    // DOM structure (there's always leaf nodes for the cursor).
    return;
  }
  if (type == "th" || type == "td") {
    let align = state.attrs?.[0]?.[1]?.split(":")?.[1] ?? "left";
    if (align != "left" && align != "right" && align != "center") {
      align = "left"; // should be impossible; makes typescript happy
    }
    return { type, children, align };
  } else {
    return { type, children };
  }
}

export const StaticElement = ({ attributes, children, element }) => {
  switch (element.type) {
    case "table":
      return (
        <div
          {...attributes}
          className="ant-table"
          style={{ fontSize: "inherit" }}
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
      return (
        <th
          {...attributes}
          style={{ textAlign: element.align ?? "left" } as CSS}
          className="ant-table-cell"
        >
          {children}
        </th>
      );
    case "td":
      return (
        <td
          {...attributes}
          style={{ textAlign: element.align ?? "left" } as CSS}
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
  toSlate,
  StaticElement,
});

register({
  slateType: "table",
  toSlate,
  StaticElement,
});
