/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { alert_message } from "../../alerts";
import { callback } from "awaiting";

CodeMirror.defineExtension("insert_special_char", async function (): Promise<
  void
> {
  // @ts-ignore
  const cm = this;

  const mode = cm.get_edit_mode();
  if (["html", "md"].indexOf(mode) == -1) {
    alert_message({
      type: "error",
      message: `Not Implemented: ${mode} special symbols not yet implemented`,
    });
    return;
  }

  // TODO: rewrite using antd
  const dialog = $("#webapp-editor-templates")
    .find(".webapp-html-editor-symbols-dialog")
    .clone();
  (dialog as any).modal("show");
  dialog
    .find(".btn-close")
    .off("click")
    .click(function () {
      (dialog as any).modal("hide");
      return false;
    });

  const selected = (evt) => {
    const target = $(evt.target);
    if (target.prop("tagName") !== "SPAN") {
      return;
    }
    (dialog as any).modal("hide");
    const code = target.attr("title");
    const s = `&${code};`;
    // FUTURE: HTML-based formats will work, but not LaTeX.
    // As long as the input encoding in LaTeX is utf8, just insert the actual utf8 character (target.text())

    const selections = cm.listSelections();
    selections.reverse();
    for (let sel of selections) {
      cm.replaceRange(s, sel.head);
    }
  };

  dialog
    .find(".webapp-html-editor-symbols-dialog-table")
    .off("click")
    .click(selected);

  await callback((cb) =>
    dialog.keydown((evt) => {
      if (evt.which === 13 || evt.which === 27) {
        // escape or enter just closes the dialog
        (dialog as any).modal("hide");
        cb();
        return false;
      }
    })
  );
});
