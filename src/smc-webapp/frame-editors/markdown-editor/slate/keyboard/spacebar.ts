/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit the space bar.
*/

import { toggleCheckbox } from "../elements/checkbox";
import { register } from "./register";

register({ key: " " }, ({editor}) => {
  if (toggleCheckbox(editor)) {
    return true;
  }

  // @ts-ignore - that second argument below is "unsanctioned"; it controls
  // whether autoformat should happen.
  editor.insertText(" ", true);
  return true;
});
