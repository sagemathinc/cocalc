/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Transforms, Element } from "slate";
import {
  get_insert_link_opts_from_user,
  Options,
} from "smc-webapp/codemirror/extensions/insert-link";
import { alert_message } from "smc-webapp/alerts";
import { getSelection, selectionToText } from "./commands";

export async function insertLink(editor): Promise<void> {
  let opts: Options | undefined = undefined;
  try {
    opts = await get_insert_link_opts_from_user(selectionToText(editor), false);
  } catch (err) {
    alert_message({ type: "error", message: err.errorFields[0]?.errors });
    return;
  }
  if (opts == null) return; // user canceled.

  const node = {
    type: "link",
    isInline: true,
    url: opts.url,
    title: opts.title,
    children: [{ text: opts.displayed_text }],
  } as Element;
  Transforms.insertFragment(editor, [node], { at: getSelection(editor) });
}
