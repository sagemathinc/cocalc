/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import onecolor from "onecolor";

export function avatar_fontcolor(bg): "white" | "black" {
  const col_bg = onecolor(bg);
  if (!col_bg) {
    return "black";
  }
  if (col_bg.isLight()) {
    return "black";
  } else {
    return "white";
  }
}
