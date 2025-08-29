/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
What happens when you hit the space bar.

We also make shift+space do autoformat for the following reason:
"We also **allow** shift+space for autoformat, since it is easy to accidentally
type!  E.g., trying typing "> " quickly a few times on a US keyboard, and you'll
find that > is shift+., and you often don't lift off the shift before hitting space."
and to implement it include { key: " ", shift: true } in the list below.
However, I think overall it's more valuable to allow shift+space to insert a space
without autoformat, since there must be an easy way to do this.

To insert a space without formatting, use some other modifier that your browser or
OS doesn't take.  On MacOS that includes option+space for now.
TODO: instead, anytime autoformat happens, there could be an indicator about it in the
toolbar, with a button to undo it (leaving the space).  This would be general for
return as well.

IMPORTANT: we also explicitly do this same insertText action in
frontend/editors/slate/slate-react/components/editable.tsx
to handle virtual keyboards. See https://github.com/sagemathinc/cocalc/issues/8536
*/

import { toggleCheckbox } from "../elements/checkbox/editable";
import { register } from "./register";

register([{ key: " " }, { key: " ", shift: true }], ({ editor }) => {
  if (toggleCheckbox(editor)) {
    return true;
  }

  // @ts-ignore - that second argument below is "unsanctioned"; it controls
  // whether autoformat should happen.
  editor.insertText(" ", true);
  return true;
});
