/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { startswith } from "smc-util/misc";
import { register } from "./register";

// Map from prefix of markdown token types to Slate marks.
// This shouldn't need to change ever, since markdown is done,
// though maybe a markdown-it plugin could add to this.
const TYPES = {
  em: "italic",
  strong: "bold",
  s: "strikethrough",
};

// Map from inline HTML tags to Slate marks.
// The "cool" thing is that if you have some bits of html that
// use these tags, then they will get transformed into proper
// markdown (when possible) when you edit the slate file.
// Obviously, if the user had nested inline html,
// it may break, unless we can handle everything.  Of course,
// html is defined and we might actually handle most everything.
const TAGS = {
  u: "underline",
  sup: "sup",
  sub: "sub",
  tt: "tt",
  code: "code",
  i: "italic",
  em: "italic",
  strong: "bold",
  b: "bold",
  small: "small",
};

// Expand the above info into some useful tables to
// make processing faster.  Better to do these for
// loops once and for all, rather than on *every token*.

const HOOKS = [];
for (const type in TYPES) {
  HOOKS[type + "_open"] = { [TYPES[type]]: true };
  HOOKS[type + "_close"] = { [TYPES[type]]: false };
}

for (const tag in TAGS) {
  HOOKS["<" + tag + ">"] = { [TAGS[tag]]: true };
  HOOKS["</" + tag + ">"] = { [TAGS[tag]]: false };
}

/*
updateMarkState updates the state of text marks if this token
just changing marking state.  If there is a change, return true
to stop further processing.
*/
function handleMarks({ token, state }) {
  const t = HOOKS[token.type];
  if (t != null) {
    for (const mark in t) {
      state.marks[mark] = t[mark];
      return [];
    }
  }

  if (token.type == "html_inline") {
    // special cases for underlining, sup, sub, which markdown doesn't have.
    const x = token.content.toLowerCase();
    const t = HOOKS[x];
    if (t != null) {
      for (const mark in t) {
        state.marks[mark] = t[mark];
        return [];
      }
    }

    // The following are trickier, since they involve
    // parameters...

    if (x == "</span>") {
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
    }

    if (!startswith(x, "<span style=")) {
      // don't waste time parsing further.
      return;
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
