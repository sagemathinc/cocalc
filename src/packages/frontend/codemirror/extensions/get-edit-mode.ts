/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

CodeMirror.defineExtension("get_edit_mode", function (cur?: {
  line: number;
  ch: number;
}): string | undefined {
  // @ts-ignore
  const editor = this;
  switch (editor.getModeAt(cur ?? editor.getCursor()).name) {
    case "markdown":
    case "yaml-frontmatter":
      return "md";
    case "xml":
      return "html";
    case "mediawiki":
      return "mediawiki";
    case "stex":
      return "tex";
    case "python":
      return "python";
    case "r":
      return "r";
    case "julia":
      return "julia";
    default:
      const { name } = editor.getOption("mode");
      if (name.slice(0, 3) === "gfm" || name == "yaml-frontmatter") {
        return "md";
      } else if (name.slice(0, 9) === "htmlmixed") {
        return "html";
      } else if (name.indexOf("mediawiki") !== -1) {
        return "mediawiki";
      } else if (name.indexOf("rst") !== -1) {
        return "rst";
      } else if (name.indexOf("stex") !== -1) {
        return "tex";
      }
      if (
        ["md", "html", "tex", "rst", "mediawiki", "r"].indexOf(name) == -1
      ) {
        return "html";
      }
  }
});
