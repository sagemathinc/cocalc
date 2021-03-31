/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// jquery plugins that involve codemirror.

export const jQuery = $;
declare var $: any;
declare const CodeMirror: any;
import { startswith } from "smc-util/misc";
import { file_associations } from "../file-associations";

// Attempt to syntax highlight all code blocks that have CSS class language-*.
// This is done using CodeMirror in a way that is consistent with the rest
// of cocalc (e.g., supported languages and how they are mapped to modes).
// Used e.g., in markdown for
// ```r
// v <- c(1,2)
// ```
// Here language-[mode] will first see if "mode" is a filename extension and use
// the corresponding mode, and otherwise fall back to the codemirror mode name.

$.fn.highlight_code = function () {
  return this.each(function () {
    // @ts-ignore
    const that = $(this);
    for (const elt of that.find("code")) {
      for (const cls of elt.className.split(/\s+/)) {
        if (startswith(cls, "language-")) {
          const code = $(elt);
          const ext = cls.slice("language-".length);
          const spec = file_associations[ext];
          const mode = spec?.opts.mode ?? ext;
          CodeMirror.runMode(code.text(), mode, elt);
          code.addClass("cm-s-default");
          code.removeClass(cls);
        }
      }
    }
  });
};
