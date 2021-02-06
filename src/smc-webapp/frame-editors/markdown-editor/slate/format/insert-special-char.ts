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
import { restoreSelection } from "./commands";

export async function insertSpecialChar(editor): Promise<void> {
  let opts: Options | undefined = undefined;
  console.log(0);
  try {
    try {
      console.log(1);
      opts = await get_insert_special_char_from_user();
      console.log(2, opts);
    } catch (err) {
      alert_message({ type: "error", message: err.errorFields[0]?.errors });
      return;
    }
    if (opts == null) return; // user canceled.
  } finally {
    console.log(3);
    // The above dialog breaks focus, so we always restore it.
    await restoreSelection(editor);
  }

  console.log(4, editor, opts.char);
  Transforms.insertText(editor, opts.char);
}
