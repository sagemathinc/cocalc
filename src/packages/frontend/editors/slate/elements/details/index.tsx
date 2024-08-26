/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { load } from "cheerio";

import { register, SlateElement } from "../register";
import { dict } from "@cocalc/util/misc";

export const STYLE = {
  cursor: "pointer",
  background: "#f6f6f6",
  color: "black",
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
          <summary style={{ cursor: "pointer", display: "list-item" }}>
            {node.summary}
          </summary>
        )}
        {children}
      </details>
    );
  },

  toSlate: ({ children, state, token }) => {
    const attrs = dict(state.attrs as any);
    const $ = load("");
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
