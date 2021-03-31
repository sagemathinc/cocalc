/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit the space bar.
*/

import { toggleCheckbox } from "../elements/checkbox";
import { register } from "./register";

// We also **allow** shift+space for autoformat, since it is easy to accidentally
// type!  E.g., trying typing "> " quickly a few times on a US keyboard, and you'll
// find that > is shift+., and you often don't lift off the shift before hitting space.
register([{ key: " " }, { key: " ", shift: true }], ({ editor }) => {
  if (toggleCheckbox(editor)) {
    return true;
  }

  // @ts-ignore - that second argument below is "unsanctioned"; it controls
  // whether autoformat should happen.
  editor.insertText(" ", true);
  return true;
});
