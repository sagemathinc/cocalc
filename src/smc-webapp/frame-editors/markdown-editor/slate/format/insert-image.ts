/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Transforms, Element } from "slate";
import {
  get_insert_image_opts_from_user,
  Options,
} from "smc-webapp/codemirror/extensions/insert-image";
import { alert_message } from "smc-webapp/alerts";
import { restoreSelectionAndFocus } from "./commands";

export async function insertImage(editor): Promise<void> {
  let opts: Options | undefined = undefined;
  try {
    try {
      opts = await get_insert_image_opts_from_user();
    } catch (err) {
      alert_message({ type: "error", message: err.errorFields[0]?.errors });
      return;
    }
    if (opts == null) return; // user canceled.
  } finally {
    // The above dialog breaks focus, so we always restore it.
    await restoreSelectionAndFocus(editor);
  }

  const node = {
    type: "image",
    isInline: true,
    src: opts.url,
    title: opts.title,
    height: opts.height,
    width: opts.width,
    children: [{ text: "" }],
  } as Element;
  Transforms.insertFragment(editor, [node]);
}
