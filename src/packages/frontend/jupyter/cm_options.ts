/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This module will handle setting the codemirror options for various kernels.
*/

import { IS_TOUCH } from "@cocalc/frontend/feature";

// TODO: should merge functionality with this
import { valid_indent } from "@cocalc/frontend/frame-editors/codemirror/util";
import { extra_alt_keys } from "@cocalc/frontend/frame-editors/codemirror/mobile";

// mode = codemirror mode object
// editor_settings - from account store.
// TODO: type parameters
export function cm_options(
  mode?: string | { name: string },
  editor_settings?: any,
  line_numbers?: any,
  read_only?: any
) {
  if (editor_settings == null) {
    editor_settings = {};
  }
  if (mode == null) {
    mode = { name: "python" };
  }
  if (typeof mode === "string") {
    mode = { name: mode };
  }
  if (mode.name === "gp") {
    // TODO; more substitutions?
    mode.name = "pari";
  }
  if (mode.name === "singular") {
    mode.name = "clike"; // better than nothing
  }
  if (mode.name === "ihaskell") {
    mode.name = "haskell";
  }

  const options: any = {
    mode,
    firstLineNumber: editor_settings.first_line_number,
    showTrailingSpace:
      editor_settings.show_trailing_whitespace ||
      (mode && mode.name) === "gfm2",
    indentUnit: valid_indent(editor_settings.tab_size), // TODO! indent_unit just isn't implemented -- see #2847.  same comment is in frame editors' cm-options.ts
    tabSize: valid_indent(editor_settings.tab_size),
    smartIndent: editor_settings.smart_indent,
    electricChars: editor_settings.electric_chars,
    undoDepth: editor_settings.undo_depth,
    matchBrackets: editor_settings.match_brackets,
    autoCloseBrackets: editor_settings.auto_close_brackets,
    autoCloseTags: editor_settings.auto_close_xml_tags,
    foldGutter: editor_settings.code_folding,
    lineWrapping: true,
    readOnly: read_only,
    indentWithTabs: !editor_settings.spaces_instead_of_tabs,
    showCursorWhenSelecting: true,
    extraKeys: {},
    // NOTE: "keyMap" and other properties listed below must not appear here as "undefined"
    // that is, the key should only exist if the value exists. I'm guessing Codemirror
    // actually looks at the existence of keys rather than existance of values.
  };

  if (options.mode?.name == "gfm2") {
    // browser native spellcheck now supported!
    options.spellcheck = true;
    options.inputStyle = "contenteditable";
  }

  if (IS_TOUCH) {
    extra_alt_keys(options.extraKeys, undefined, editor_settings);
  }
  if (line_numbers != null) {
    options.lineNumbers = line_numbers;
  }
  // NOTE: We ignore the account-wide default for now because line numbers are less necessary
  // in jupyter, off by default in the official client, and they are currently slower
  // due to our static fallback not being done for them (will do in #v2).
  // TODO: Implement jupyter-specific account-wide default setting.

  if (
    editor_settings.bindings != null &&
    editor_settings.bindings !== "standard"
  ) {
    options.keyMap = editor_settings.bindings;
  }

  if (editor_settings.theme != null && editor_settings.theme !== "standard") {
    options.theme = editor_settings.theme;
  }

  if (options.mode.name === "ipython") {
    // See https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/codemirror-ipython.js
    // This ipython mode is because upstream jupyter doesn't directly
    // run the CodeMirror parser; also, it will only work for
    // python -- what about other languages. See parsing.ts
    // for our approach.
    options.mode.name = "python";
  }

  return options;
}
