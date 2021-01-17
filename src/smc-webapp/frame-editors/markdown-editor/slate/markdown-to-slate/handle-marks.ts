/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { startswith } from "smc-util/misc";
import { register } from "./register";

/*
updateMarkState updates the state of text marks if this token
just changing marking state.  If there is a change, return true
to stop further processing.
*/
function handleMarks({ token, state }) {
  switch (token.type) {
    case "em_open":
      state.marks.italic = true;
      return [];
    case "strong_open":
      state.marks.bold = true;
      return [];
    case "s_open":
      state.marks.strikethrough = true;
      return [];
    case "em_close":
      state.marks.italic = false;
      return [];
    case "strong_close":
      state.marks.bold = false;
      return [];
    case "s_close":
      state.marks.strikethrough = false;
      return [];
  }

  if (token.type == "html_inline") {
    // special cases for underlining, sup, sub, which markdown doesn't have.
    const x = token.content.toLowerCase();
    switch (x) {
      case "<u>":
        state.marks.underline = true;
        return [];
      case "</u>":
        state.marks.underline = false;
        return [];
      case "<sup>":
        state.marks.sup = true;
        return [];
      case "</sup>":
        state.marks.sup = false;
        return [];
      case "<sub>":
        state.marks.sub = true;
        return [];
      case "</sub>":
        state.marks.sub = false;
        return [];
      case "</span>":
        for (const mark in state.marks) {
          if (startswith(mark, "color:")) {
            delete state.marks[mark];
            return [];
          }
          for (const c of ["family", "size"]) {
            if (startswith(mark, `font-${c}:`)) {
              delete state.marks[mark];
              return [];
            }
          }
        }
        break;
    }

    // Colors look like <span style='color:#ff7f50'>:
    if (startswith(x, "<span style='color:")) {
      // delete any other colors -- only one at a time
      for (const mark in state.marks) {
        if (startswith(mark, "color:")) {
          delete state.marks[mark];
        }
      }
      // now set our color
      const c = x.split(":")[1]?.split("'")[0];
      if (c) {
        state.marks["color:" + c] = true;
      }
      return [];
    }

    for (const c of ["family", "size"]) {
      if (startswith(x, `<span style='font-${c}:`)) {
        const n = `<span style='font-${c}:`.length;
        // delete any other fonts -- only one at a time
        for (const mark in state.marks) {
          if (startswith(mark, `font-${c}:`)) {
            delete state.marks[mark];
          }
        }
        // now set our font
        state.marks[`font-${c}:${x.slice(n, x.length - 2)}`] = true;
        return [];
      }
    }
  }
}

register(handleMarks);
