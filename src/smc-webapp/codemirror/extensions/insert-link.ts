/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { callback } from "awaiting";

CodeMirror.defineExtension("insert_link", async function () {
  // @ts-ignore
  const cm = this;

  // [ ] REWRITE WITH ANTD
  const dialog = $("#webapp-editor-templates")
    .find(".webapp-html-editor-link-dialog")
    .clone();
  (dialog as any).modal("show");
  dialog
    .find(".btn-close")
    .off("click")
    .click(function () {
      (dialog as any).modal("hide");
      setTimeout(focus, 50);
      return false;
    });
  let url : any = dialog.find(".webapp-html-editor-url");
  url.focus();
  let display : any = dialog.find(".webapp-html-editor-display");
  let target : any = dialog.find(".webapp-html-editor-target");
  let title: any = dialog.find(".webapp-html-editor-title");

  const selected_text = cm.getSelection();
  display.val(selected_text);

  const mode = cm.get_edit_mode();

  if (["md", "rst", "tex"].indexOf(mode) != -1) {
    dialog.find(".webapp-html-editor-target-row").hide();
  }

  const submit = () => {
    (dialog as any).modal("hide");
    let s: string;
    if (mode === "md") {
      // [Python](http://www.python.org/)
      title = title.val();

      if (title.length > 0) {
        title = ` \"${title}\"`;
      }

      const d = display.val();
      // @ts-ignore
      if (d.length > 0) {
        s = `[${d}](${url.val()}${title})`;
      } else {
        s = url.val();
      }
    } else if (mode === "rst") {
      // `Python <http://www.python.org/#target>`_

      // @ts-ignore
      if (display.val().length > 0) {
        display = `${display.val()}`;
      } else {
        display = `${url.val()}`;
      }

      s = `\`${display} <${url.val()}>\`_`;
    } else if (mode === "tex") {
      // \url{http://www.wikibooks.org}
      // \href{http://www.wikibooks.org}{Wikibooks home}
      cm.tex_ensure_preamble?.("\\usepackage{url}");
      // @ts-ignore
      display = display.val().trim();
      url = url.val();
      url = url.replace(/#/g, "\\#"); // should end up as \#
      url = url.replace(/&/g, "\\&"); // ... \&
      url = url.replace(/_/g, "\\_"); // ... \_
      if (display.length > 0) {
        s = `\\href{${url}}{${display}}`;
      } else {
        s = `\\url{${url}}`;
      }
    } else if (mode === "mediawiki") {
      // https://www.mediawiki.org/wiki/Help:Links
      // [http://mediawiki.org MediaWiki]
      display = display.val().trim();
      if (display.length > 0) {
        display = ` ${display}`;
      }
      s = `[${url.val()}${display}]`;
    } else {
      // if (mode == "html") ## HTML default fallback
      // @ts-ignore
      target = target.val().trim();
      // @ts-ignore
      title = title.val().trim();

      if (target === "_blank") {
        target = " target='_blank' rel='noopener'";
      }

      if (title.length > 0) {
        title = ` title='${title}'`;
      }

      if (display.val().length > 0) {
        display = `${display.val()}`;
      } else {
        display = url.val();
      }
      s = `<a href='${url.val()}'${title}${target}>${display}</a>`;
    }

    const selections = cm.listSelections();
    selections.reverse();
    for (const sel of selections) {
      if (sel.empty()) {
        cm.replaceRange(s, sel.head);
      } else {
        cm.replaceRange(s, sel.from(), sel.to());
      }
    }
  };

  dialog.find(".btn-submit").off("click").click(submit);

  await callback((cb) => {
    dialog.keydown((evt) => {
      if (evt.which === 13) {
        // enter
        submit();
        cb();
        return false;
      }
      if (evt.which === 27) {
        // escape
        (dialog as any).modal("hide");
        cb();
        return false;
      }
    });
  });
});
