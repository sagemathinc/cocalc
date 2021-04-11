/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit the tab key.
*/

import { register } from "./register";
import { indentListItem, unindentListItem } from "../format/indent";

register({ key: "Tab", shift: true }, ({editor}) => {
  if (unindentListItem(editor)) {
    return true;
  }
  // for now... but maybe remove it later
  editor.insertText("    ");
  return true;
});

register({ key: "Tab" }, ({editor}) => {
  if (indentListItem(editor)) {
    return true;
  }

  // Markdown doesn't have a notion of tabs in text, so
  // putting in four spaces for now, but is this optimal?
  editor.insertText("    ");
  return true;
});
