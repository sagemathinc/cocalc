/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ensure_ends_in_exactly_one_newline, li_indent } from "../../util";
import { register } from "../register";

register({
  slateType: "list_item",

  fromSlate: ({ children, info }) => {
    let indent = 2;
    let item: string;

    if (info.parent == null) {
      // should never happen for list *items*.
      item = `- ${children}`;
    } else if (info.parent.type == "bullet_list") {
      item = `- ${children}`;
    } else if (info.parent.type == "ordered_list") {
      const number = `${(info.index ?? 0) + (info.parent.start ?? 1)}`;
      indent = number.length + 2;
      item = `${number}. ${children}`;
    } else {
      // should also never happen
      item = `- ${children}`;
    }

    let s = ensure_ends_in_exactly_one_newline(li_indent(item, indent));
    if (!info.parent?.tight) {
      // NOTE: the ? above is so this code works even if the document
      // structure is invalid.
      s += "\n";
    } else {
      // if it is tight, above ensures it ends with a single newline instead of 2 or more
      // This comes up only because of caching of the markdown that produces something.
      // E.g., if you take a non-tight list in source, then edit it in slate to make it
      // tight, then export back to source.
      // We also can't have whitespace lines except in fenced block, since that can't be
      // represented by a tight light.  This is difficult, and if there are backticks, we
      // just don't do anything (don't want to cause problems; it's better to just leave
      // list non-tight).
      // See https://stackoverflow.com/questions/16369642/javascript-how-to-use-a-regular-expression-to-remove-blank-lines-from-a-string
      // for discussion of regexp:
      if (!s.includes("```")) {
        s = s.replace(/^\s*$(?:\r\n?|\n)/gm, "");
      }
    }
    return s;
  },
});

/*
Trying to make this tight causes trouble due to the whitespace line between -x and "  - a".

- x

  - a
  - b
- y

  - c

This would get modified by above algorithm:

- a
  ```

  foo
  ```
- b
- c


*/
