/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Transforms } from "slate";

export function selectAll(editor: Editor): void {
  const first = Editor.first(editor, []);
  const last = Editor.last(editor, []);
  const offset = last[0]["text"]?.length ?? 0;
  Transforms.setSelection(editor, {
    anchor: { path: first[1], offset: 0 },
    focus: { path: last[1], offset },
  });
}
