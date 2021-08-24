/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "../register";

register({
  slateType: ["bullet_list", "ordered_list"],

  fromSlate: ({ node, info, children }) => {
    let s = children;
    if (
      s[s.length - 2] != "\n" &&
      !(info.parent?.type == "list_item" && node.tight)
    ) {
      // list should end with two new lines, unless parent is an item in a tight list.
      s += "\n";
    }
    if (
      node.type == "ordered_list" &&
      node.start != null &&
      node.start != 1 &&
      info.parent?.type == "list_item"
    ) {
      /*
      This is a weird case, but if you put an enumerated list that starts
      with anything except 1 inside of another list without a leading newline,
      then it breaks.  It works fine with 1.  Several markdown parsers do
      this, so whatever.  Note that this makes it impossible to have an
      ordered list nested inside a tight list if the numeration starts at
      a value other than 1.  Again, this is the way it is.  (Note: This sort
      of looks like it works without the newline but that's because of breaks=true.)
      Example -- the following does not work right, but if you change "2. xyz"
      to "1. xyz" then it does.

1. abc
   2. xyz
   3. foo
2. xyz
      */
      s = "\n" + s;
    }
    return s;
  },

  rules: { autoFocus: true },
});
