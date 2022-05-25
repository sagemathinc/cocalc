/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { register, SlateElement } from "../register";
import { dict } from "@cocalc/util/misc";
import $ from "cheerio";

export const STYLE = {
  cursor: "pointer",
  background: "#f6f6f6",
  padding: "0.5rem 1rem",
  borderRadius: "5px",
} as CSSProperties;

export interface Details extends SlateElement {
  type: "details";
  isInline?: boolean;
  open?: boolean;
  summary: string;
}

register({
  slateType: "details",

  StaticElement: ({ attributes, children, element }) => {
    const node = element as Details;
    return (
      <details {...{ ...attributes, ...{ open: node.open } }} style={STYLE}>
        {node.summary && (
          <summary>{node.summary}</summary>
        )}
        {children}
      </details>
    );
  },

  toSlate: ({ children, state, token }) => {
    const attrs = dict(state.attrs as any);
    const x = $(token.content);
    const summary = x.find("summary").text().trim();
    return {
      type: "details",
      children,
      isInline: token.type == "html_inline",
      open: attrs.open,
      summary,
    };
  },
});
