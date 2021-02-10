/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Keyboard shortcuts related to our redux actions.
*/

import { register } from "./register";

register(
  [
    { key: "s", ctrl: true },
    { key: "s", meta: true },
  ],
  ({ extra }) => {
    extra?.actions.save(true);
    return true;
  }
);

register(
  [
    { key: ",", ctrl: true, shift: true },
    { key: ",", meta: true, shift: true },
  ],
  ({ extra }) => {
    extra?.actions.change_font_size(-1);
    return true;
  }
);

register(
  [
    { key: ".", ctrl: true, shift: true },
    { key: ".", meta: true, shift: true },
  ],
  ({ extra }) => {
    extra?.actions.change_font_size(+1);
    return true;
  }
);

register(
  [
    { key: "z", meta: true },
    { key: "z", ctrl: true },
  ],
  ({ extra }) => {
    if (extra == null) return false;
    extra.actions.undo(extra.id);
    extra.hasUnsavedChangesRef.current = false;
    //ReactEditor.focus(editor);
    return true;
  }
);

register(
  [
    { key: "z", meta: true, shift: true },
    { key: "z", ctrl: true, shift: true },
  ],
  ({ extra }) => {
    if (extra == null) return false;
    extra.actions.redo(extra.id);
    extra.hasUnsavedChangesRef.current = false;
    //ReactEditor.focus(editor);
    return true;
  }
);
