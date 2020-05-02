/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";

import { merge, types } from "smc-util/misc";

export const entry_style: CSSProperties = {};

export const selected_entry: CSSProperties = merge(
  {
    border: "1px solid #aaa",
    boxShadow: "5px 5px 5px #999",
    borderRadius: "3px",
    marginBottom: "10px",
  },
  exports.entry_style
);

export const note: CSSProperties = {
  borderTop: "3px solid #aaa",
  marginTop: "10px",
  paddingTop: "5px",
};

export function show_hide_deleted(opts): CSSProperties {
  types(opts, { needs_margin: types.bool.isRequired });

  return {
    marginTop: opts.needs_margin ? "15px" : "0px",
    float: "right",
  };
}
