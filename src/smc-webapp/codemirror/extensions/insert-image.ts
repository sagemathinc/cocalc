/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { callback } from "awaiting";

CodeMirror.defineExtension("insert_image", async function (): Promise<void> {
  // @ts-ignore
  const cm = this;

  const dialog = $("#webapp-editor-templates")
    .find(".webapp-html-editor-image-dialog")
    .clone();
  (dialog as any).modal("show");
  dialog
    .find(".btn-close")
    .off("click")
    .click(function () {
      (dialog as any).modal("hide");
      return false;
    });
  const url = dialog.find(".webapp-html-editor-url");
  url.focus();

  const mode = cm.get_edit_mode();

  if (mode === "tex") {
    // different units and don't let user specify the height
    dialog.find(".webapp-html-editor-height-row").hide();
    dialog.find(".webapp-html-editor-image-width-header-tex").show();
    dialog.find(".webapp-html-editor-image-width-header-default").hide();
    dialog.find(".webapp-html-editor-width").val("80");
  }

  const submit = () => {
    let width;
    (dialog as any).modal("hide");
    // @ts-ignore
    let title = dialog.find(".webapp-html-editor-title").val().trim();
    let height = (width = "");
    // @ts-ignore
    const h = dialog.find(".webapp-html-editor-height").val().trim();
    if (h.length > 0) {
      height = ` height=${h}`;
    }
    // @ts-ignore
    const w = dialog.find(".webapp-html-editor-width").val().trim();
    if (w.length > 0) {
      width = ` width=${w}`;
    }
    let s: string = "";

    if (mode === "rst") {
      // .. image:: picture.jpeg
      //    :height: 100px
      //    :width: 200 px
      //    :alt: alternate text
      //    :align: right
      s = `\n.. image:: ${url.val()}\n`;
      // @ts-ignore
      height = dialog.find(".webapp-html-editor-height").val().trim();
      if (height.length > 0) {
        s += `   :height: ${height}px\n`;
      }
      // @ts-ignore
      width = dialog.find(".webapp-html-editor-width").val().trim();
      if (width.length > 0) {
        s += `   :width: ${width}px\n`;
      }
      if (title.length > 0) {
        s += `   :alt: ${title}\n`;
      }
    } else if (mode === "md" && width.length === 0 && height.length === 0) {
      // use markdown's funny image format if width/height not given
      if (title.length > 0) {
        title = ` \"${title}\"`;
      }
      s = `![](${url.val()}${title})`;
    } else if (mode === "tex") {
      cm.tex_ensure_preamble("\\usepackage{graphicx}");
      width = parseInt(`${dialog.find(".webapp-html-editor-width").val()}`, 10);
      if (`${width}` === "NaN") {
        width = "0.8";
      } else {
        width = `${width / 100.0}`;
      }
      if (title.length > 0) {
        s = `\
\\begin{figure}[p]
    \\centering
    \\includegraphics[width=${width}\\textwidth]{${url.val()}}
    \\caption{${title}}
\\end{figure}\
`;
      } else {
        s = `\\includegraphics[width=${width}\\textwidth]{${url.val()}}`;
      }
    } else if (mode === "mediawiki") {
      // https://www.mediawiki.org/wiki/Help:Images
      // [[File:Example.jpg|<width>[x<height>]px]]
      let size = "";
      if (w.length > 0) {
        size = `|${w}`;
        if (h.length > 0) {
          size += `x${h}`;
        }
        size += "px";
      }
      s = `[[File:${url.val()}${size}]]`;
    } else {
      // fallback for mode == "md" but height or width is given
      if (title.length > 0) {
        title = ` title='${title}'`;
      }
      s = `<img src='${url.val()}'${width}${height}${title}>`;
    }
    const selections = cm.listSelections();
    selections.reverse();
    for (const sel of selections) {
      cm.replaceRange(s, sel.head);
    }
  };

  dialog.find(".btn-submit").off("click").click(submit);
  await callback((cb) =>
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
    })
  );
});
