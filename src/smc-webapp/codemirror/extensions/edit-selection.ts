/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

import { defaults, required, startswith } from "smc-util/misc";
import { sagews_canonical_mode, open_new_tab } from "../../misc-page";
import {
  FONT_FACES,
  commands as EDIT_COMMANDS,
} from "../../editors/editor-button-bar";
import { markdown_to_html } from "../../markdown";

/*
Apply an edit to the selected text in an editor; works with one or more
selections. What happens depends on the mode. This is used to implement an
editor on top of codemirror, e.g., to provide features like "make the selected
text be in italics" or "comment out the selected text".
*/

// The plugin is async; awaiting it can take a while, since it might have to
// wait for user to respond to dialog boxes.
CodeMirror.defineExtension("edit_selection", async function (opts: {
  cmd: string;
  args?: string | number;
  mode?: string;
}): Promise<void> {
  opts = defaults(opts, {
    cmd: required,
    args: undefined,
    mode: undefined,
  });
  // @ts-ignore
  const cm = this;

  // Special cases -- link/image/SpecialChar commands handle themselves:
  switch (opts.cmd) {
    case "link":
      await cm.insert_link();
      return;
    case "image":
      await cm.insert_image();
      return;
    case "SpecialChar":
      await cm.insert_special_char();
      return;
  }

  const default_mode = opts.mode ?? cm.get_edit_mode();
  const canonical_mode = (name) => sagews_canonical_mode(name, default_mode);

  const { args, cmd } = opts;

  // FUTURE: will have to make this more sophisticated, so it can
  // deal with nesting, spans, etc.
  const strip = function (
    src: string,
    left: string,
    right: string
  ): string | undefined {
    left = left.toLowerCase();
    right = right.toLowerCase();
    const src0 = src.toLowerCase();
    const i = src0.indexOf(left);
    if (i !== -1) {
      const j = src0.lastIndexOf(right);
      if (j !== -1) {
        return (
          src.slice(0, i) +
          src.slice(i + left.length, j) +
          src.slice(j + right.length)
        );
      }
    }
    // Nothing got striped -- returns undefined to
    // indicate that there was no wrapping to strip.
  };

  const selections = cm.listSelections();
  for (let selection of selections) {
    let left = "";
    const mode = canonical_mode(cm.getModeAt(selection.head).name);
    const from = selection.from();
    const to = selection.to();
    let src = cm.getRange(from, to);
    const start_line_beginning = from.ch === 0;
    const until_line_ending = cm.getLine(to.line).length === to.ch;

    let mode1 = mode;
    const data_for_mode = EDIT_COMMANDS[mode1];
    /* console.log("edit_selection", {
      args,
      cmd,
      default_mode,
      selection,
      src,
      data_for_mode,
    });*/

    if (data_for_mode == null) {
      // TODO: better way to alert that this isn't going to work?
      console.warn(`mode '${mode1}' is not defined!`);
      return;
    }
    var how = data_for_mode[cmd];
    if (how == null) {
      if (["md", "mediawiki", "rst"].indexOf(mode1) != -1) {
        // html fallback for markdown
        mode1 = "html";
      } else if (mode1 === "python") {
        // Sage fallback in python mode. FUTURE: There should be a Sage mode.
        mode1 = "sage";
      }
      how = EDIT_COMMANDS[mode1][cmd];
    }

    // trim whitespace
    let i = 0;
    let j = src.length - 1;
    if (how != null && (how.trim ?? true)) {
      while (i < src.length && /\s/.test(src[i])) {
        i += 1;
      }
      while (j > 0 && /\s/.test(src[j])) {
        j -= 1;
      }
    }
    j += 1;
    const left_white = src.slice(0, i);
    const right_white = src.slice(j);
    src = src.slice(i, j);
    let src0 = src;

    let done: boolean = false;

    // this is an abuse, but having external links to the documentation is good
    if (how?.url != null) {
      open_new_tab(how.url);
      done = true;
    }

    if (how?.wrap != null) {
      const { space } = how.wrap;
      left = how.wrap.left ?? "";
      const right = how.wrap.right ?? "";
      const process = function (src: string): string {
        let src1;
        if (how.strip != null) {
          // Strip out any tags/wrapping from conflicting modes.
          for (let c of how.strip) {
            const { wrap } = EDIT_COMMANDS[mode1][c];
            if (wrap != null) {
              src1 = strip(src, wrap.left ?? "", wrap.right ?? "");
              if (src1 != null) {
                src = src1;
                if (space && src[0] === " ") {
                  src = src.slice(1);
                }
              }
            }
          }
        }

        src1 = strip(src, left, right);
        if (src1) {
          // strip the wrapping
          src = src1;
          if (space && src[0] === " ") {
            src = src.slice(1);
          }
        } else {
          // do the wrapping
          src = `${left}${space ? " " : ""}${src}${right}`;
        }
        return src;
      };

      if (how.wrap.multi) {
        src = src.split("\n").map(process).join("\n");
      } else {
        src = process(src);
      }
      if (how.wrap.newline) {
        src = "\n" + src + "\n";
        if (!start_line_beginning) {
          src = "\n" + src;
        }
        if (!until_line_ending) {
          src += "\n";
        }
      }
      done = true;
    }

    if (how?.insert != null) {
      // to insert the code snippet right below, next line
      // SMELL: no idea what the strip(...) above is actually doing
      // no additional newline, if nothing is selected and at start of line
      if (selection.empty() && from.ch === 0) {
        src = how.insert;
      } else {
        // this also inserts a new line, if cursor is inside/end of line
        src = `${src}\n${how.insert}`;
      }
      done = true;
    }

    switch (cmd) {
      case "font_size":
        if (["html", "md", "mediawiki"].indexOf(mode) != -1) {
          for (let i = 1; i <= 7; i++) {
            const src1 = strip(src, `<font size=${i}>`, "</font>");
            if (src1) {
              src = src1;
            }
          }
          if (args !== "3") {
            src = `<font size=${args}>${src}</font>`;
          }
          done = true;
        } else if (mode === "tex") {
          // we need 6 latex sizes, for size 1 to 7 (default 3, at index 2)
          const latex_sizes = [
            "tiny",
            "footnotesize",
            "normalsize",
            "large",
            "LARGE",
            "huge",
            "Huge",
          ];
          if (args) {
            i = typeof args == "string" ? parseInt(args) : args;
            if ([1, 2, 3, 4, 5, 6, 7].indexOf(i) != -1) {
              const size = latex_sizes[i - 1];
              src = `{\\${size} ${src}}`;
            }
          }
          done = true;
        }
        break;

      case "font_size_new":
        if (["html", "md", "mediawiki"].indexOf(mode) != -1) {
          src0 = src.toLowerCase().trim();
          if (startswith(src0, "<span style='font-size")) {
            i = src.indexOf(">");
            j = src.lastIndexOf("<");
            src = src.slice(i + 1, j);
          }
          if (args !== "medium") {
            src = `<span style='font-size:${args}'>${src}</span>`;
          }
          done = true;
        } else if (mode === "tex") {
          // we need 6 latex sizes, for size 1 to 7 (default 3, at index 2)
          const latex_sizes = [
            "tiny",
            "footnotesize",
            "normalsize",
            "large",
            "LARGE",
            "huge",
            "Huge",
          ];
          if (args) {
            i = typeof args == "string" ? parseInt(args) : args;
            if ([1, 2, 3, 4, 5, 6, 7].indexOf(i) != -1) {
              const size = latex_sizes[i - 1];
              src = `{\\${size} ${src}}`;
            }
          }
          done = true;
        }
        break;

      case "color":
        if (["html", "md", "mediawiki"].indexOf(mode) != -1) {
          src0 = src.toLowerCase().trim();
          if (startswith(src0, "<span style='color")) {
            i = src.indexOf(">");
            j = src.lastIndexOf("<");
            src = src.slice(i + 1, j);
          }
          src = `<span style='color:${args}'>${src}</span>`;
          done = true;
        }
        break;

      case "background-color":
        if (["html", "md", "mediawiki"].indexOf(mode) != -1) {
          src0 = src.toLowerCase().trim();
          if (startswith(src0, "<span style='background")) {
            i = src.indexOf(">");
            j = src.lastIndexOf("<");
            src = src.slice(i + 1, j);
          }
          src = `<span style='background-color:${args}'>${src}</span>`;
          done = true;
        }
        break;

      case "font_face": // old -- still used in some old non-react editors
        if (["html", "md", "mediawiki"].indexOf(mode) != -1) {
          for (const face of FONT_FACES) {
            const src1 = strip(src, `<font face='${face}'>`, "</font>");
            if (src1) {
              src = src1;
            }
          }
          src = `<font face='${args}'>${src}</font>`;
          done = true;
        }
        break;

      case "font_family": // new -- html5 style
        if (["html", "md", "mediawiki"].indexOf(mode) != -1) {
          src0 = src.toLowerCase().trim();
          if (startswith(src0, "<span style='font-family")) {
            i = src.indexOf(">");
            j = src.lastIndexOf("<");
            src = src.slice(i + 1, j);
          }
          if (!src) {
            src = "    ";
          }
          src = `<span style='font-family:${args}'>${src}</span>`;
          done = true;
        }
        break;

      case "clean":
        if (mode === "html") {
          // do *something* to make the html more valid; of course, we could
          // do a lot more...
          src = $("<div>").html(src).html();
          done = true;
        }
        break;

      case "unformat":
        if (mode === "html") {
          src = $("<div>").html(src).text();
          done = true;
        } else if (mode === "md") {
          src = $("<div>").html(markdown_to_html(src)).text();
          done = true;
        }
        break;
    }

    if (!done) {
      if ((window as any).DEBUG && how == null) {
        console.warn(
          `CodeMirror/edit_selection: unknown for mode1='${mode1}' and cmd='${cmd}'`
        );
      }

      // TODO: should we show an alert or something??
      console.warn("not implemented");
      continue;
    }

    if (src === src0) {
      continue;
    }

    cm.focus();
    cm.replaceRange(left_white + src + right_white, from, to);

    if (how?.insert == null && how?.wrap == null) {
      if (selection.empty()) {
        // restore cursor
        const delta = left.length ?? 0;
        cm.setCursor({ line: from.line, ch: to.ch + delta });
      } else {
        // now select the new range
        const delta = src.length - src0.length;
        cm.extendSelection(from, { line: to.line, ch: to.ch + delta });
      }
    }
  }
});
