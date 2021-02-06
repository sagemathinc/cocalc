/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Transforms } from "slate";
import {
  get_insert_special_char_from_user,
  Options,
} from "smc-webapp/codemirror/extensions/insert-special-char";
import { alert_message } from "smc-webapp/alerts";
import { restoreSelectionAndFocus } from "./commands";

export async function insertSpecialChar(editor): Promise<void> {
  let opts: Options | undefined = undefined;
  try {
    try {
      opts = await get_insert_special_char_from_user();
    } catch (err) {
      alert_message({ type: "error", message: err.errorFields[0]?.errors });
      return;
    }
    if (opts == null) return; // user canceled.
  } finally {
    // The above dialog breaks focus and possibly selection, so we always restore it.
    await restoreSelectionAndFocus(editor);
  }
  Transforms.insertText(editor, opts.char);
}
