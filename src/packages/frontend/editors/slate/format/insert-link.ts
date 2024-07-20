/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Transforms, Element } from "slate";
import {
  get_insert_link_opts_from_user,
  Options,
} from "@cocalc/frontend/codemirror/extensions/insert-link";
import { alert_message } from "@cocalc/frontend/alerts";
import { getSelection, selectionToText } from "./commands";
import { delay } from "awaiting";

export async function insertLink(editor): Promise<void> {
  let opts: Options | undefined = undefined;
  // insertLink is typically called from formatAction, which
  // restores the selection -- however, that restore doesn't
  // impact the DOM until the next render loop.  Since the whole
  // insertLink is async and involves a modal dialog, it's fine
  // to wait until the DOM selection is set before getting
  // the selected text (otherwise it is blank).
  await delay(0);
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
