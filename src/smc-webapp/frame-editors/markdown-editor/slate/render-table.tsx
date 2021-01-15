/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../app-framework";
import { RenderElementProps, useFocused, useSelected } from "slate-react";
import { FOCUSED_COLOR } from "./util";

export const TableElement: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const focused = useFocused();
  const selected = useSelected();
  let backgroundColor : string | undefined = undefined;

  switch (element.type) {
    /* We render tables using straight HTML and the antd
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
