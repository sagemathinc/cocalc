/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit the space bar.

I had written this argument for making shift+space also autoformat:
"We also **allow** shift+space for autoformat, since it is easy to accidentally
type!  E.g., trying typing "> " quickly a few times on a US keyboard, and you'll
find that > is shift+., and you often don't lift off the shift before hitting space."
and to implement it include { key: " ", shift: true } in the list below.
However, I think overall it's more valuable to allow shift+space to insert a space
without autoformat, since there must be an easy way to do this.
*/

import { toggleCheckbox } from "../elements/checkbox/editable";
import { register } from "./register";

register([{ key: " " }], ({ editor }) => {
  if (toggleCheckbox(editor)) {
    return true;
  }

  // @ts-ignore - that second argument below is "unsanctioned"; it controls
  // whether autoformat should happen.
  editor.insertText(" ", true);
  return true;
});
