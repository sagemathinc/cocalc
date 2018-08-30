/*
Compute the codemirror options for file with given name,
using the given editor settings.
*/

import * as CodeMirror from "codemirror";
const { file_associations } = require("smc-webapp/file-associations");
const feature = require("smc-webapp/feature");
import { path_split } from "../generic/misc";
import { get_editor_settings } from "../generic/client";

const { filename_extension_notilde, defaults } = require("misc");

import { extra_alt_keys } from "./mobile";
import { Map } from "immutable";

export function cm_options(
  filename: string, // extension determines editor mode
  editor_settings: Map<string, any>,
  gutters: string[], // array of extra gutters
  actions: any,
  frame_id: string
): object {
  let key = filename_extension_notilde(filename).toLowerCase();
  if (!key) {
    key = `noext-${path_split(filename).tail}`.toLowerCase();
  }
  const default_opts =
    (file_associations[key] != null
      ? file_associations[key].opts
      : undefined) != null
      ? file_associations[key] != null
        ? file_associations[key].opts
        : undefined
      : {};

  let opts = defaults(default_opts, {
    undoDepth: 0, // we use our own sync-aware undo.
    mode: 'txt',
    show_trailing_whitespace: editor_settings.get(
      "show_trailing_whitespace",
      true
    ),
    allow_javascript_eval: true, // if false, the one use of eval isn't allowed.
    line_numbers: editor_settings.get("line_numbers", true),
    first_line_number: editor_settings.get("first_line_number", 1),
    indent_unit: editor_settings.get("tab_size"), // TODO! indent_unit just isn't implemented -- see #2847.
    tab_size: editor_settings.get("tab_size"),
    smart_indent: editor_settings.get("smart_indent", true),
    electric_chars: editor_settings.get("electric_chars", true),
    match_brackets: editor_settings.get("match_brackets", true),
    code_folding: editor_settings.get("code_folding", true),
    auto_close_brackets: editor_settings.get("auto_close_brackets", false),
    match_xml_tags: editor_settings.get("match_xml_tags", true),
    auto_close_xml_tags: editor_settings.get("auto_close_xml_tags", true),
    auto_close_latex: editor_settings.get("auto_close_latex", true),
    line_wrapping: editor_settings.get("line_wrapping", true),
    spaces_instead_of_tabs: editor_settings.get("spaces_instead_of_tabs", true),
    style_active_line: editor_settings.get("style_active_line", true),
    bindings: editor_settings.get("bindings"),
    theme: editor_settings.get("theme")
  });
  if (opts.mode == null) {
    // to satisfy typescript
    throw Error("mode must be specified");
  }

  const extraKeys = {
    "Ctrl-'": "indentAuto",
    "Cmd-'": "indentAuto",

    "Cmd-/": "toggleComment",
    "Ctrl-/": "toggleComment", // shortcut chosen by jupyter project (undocumented)

    "Ctrl-Space": "autocomplete",
    Tab(cm) {
      tab_key(cm, opts.spaces_instead_of_tabs);
    },
    "Shift-Tab"(cm) {
      cm.unindent_selection();
    },
    "Shift-Cmd-L"(cm) {
      cm.align_assignments();
    },
    "Shift-Ctrl-L"(cm) {
      cm.align_assignments();
    }
  };

  if (feature.IS_TOUCH) {
    // maybe should be IS_IPAD... ?
    // Better more external keyboard friendly shortcuts, motivated by iPad.
    extra_alt_keys(extraKeys, actions, frame_id, opts);
  }

  if (actions) {
    const build = () => {
      if (actions.build !== undefined) {
        actions.build(frame_id);
      } else {
        if (get_editor_settings().get("show_exec_warning")) {
          actions.set_error(
            "You can evaluate code in a file with the extension 'sagews' or 'ipynb'.   Please create a Sage Worksheet or Jupyter notebook instead."
          );
        }
      }
    };

    const actionKeys = {
      "Cmd-S"() {
        actions.save(true);
      },
      "Alt-S"() {
        actions.save(true);
      },
      "Ctrl-S"() {
        actions.save(true);
      },
      "Cmd-P"() {
        actions.print();
      },
      "Shift-Ctrl-."() {
        actions.increase_font_size(frame_id);
      },
      "Shift-Ctrl-,"() {
        actions.decrease_font_size(frame_id);
      },
      "Shift-Cmd-."() {
        actions.increase_font_size(frame_id);
      },
      "Shift-Cmd-,"() {
        actions.decrease_font_size(frame_id);
      },
      "Ctrl-L"(cm) {
        cm.execCommand("jumpToLine");
      },
      "Cmd-L"(cm) {
        cm.execCommand("jumpToLine");
      },
      "Cmd-F"(cm) {
        cm.execCommand("find");
      },
      "Ctrl-F"(cm) {
        cm.execCommand("find");
      },
      "Cmd-G"(cm) {
        cm.execCommand("findNext");
      },
      "Ctrl-G"(cm) {
        cm.execCommand("findNext");
      },
      "Shift-Cmd-G"(cm) {
        cm.execCommand("findPrev");
      },
      "Shift-Ctrl-G"(cm) {
        cm.execCommand("findPrev");
      },
      "Shift-Cmd-F"() {
        actions.format(frame_id);
      },
      "Shift-Ctrl-F"() {
        actions.format(frame_id);
      },
      "Shift-Enter"() {
        build();
      },
      "Cmd-T"() {
        build();
      },
      "Alt-T"() {
        build();
      }
    };
    for (let k in actionKeys) {
      const v = actionKeys[k];
      extraKeys[k] = v;
    }
    if (opts.bindings !== "emacs") {
      extraKeys["Ctrl-P"] = () => actions.print();
    }
  }

  if (actions.sync != null) {
    extraKeys["Alt-Enter"] = () => actions.sync(frame_id);
  }

  if (actions != null && !opts.read_only && opts.bindings !== "emacs") {
    // emacs bindings really conflict with these
    // Extra codemirror keybindings -- for some of our plugins
    // inspired by http://www.door2windows.com/list-of-all-keyboard-shortcuts-for-sticky-notes-in-windows-7/
    const keybindings = {
      bold: "Cmd-B Ctrl-B",
      italic: "Cmd-I Ctrl-I",
      underline: "Cmd-U Ctrl-U",
      comment: "Shift-Ctrl-3",
      strikethrough: "Shift-Cmd-X Shift-Ctrl-X",
      subscript: "Cmd-= Ctrl-=",
      superscript: "Shift-Cmd-= Shift-Ctrl-="
    };

    // use a closure to bind cmd.
    const f = (key, cmd) =>
      (extraKeys[key] = cm => {
        cm.edit_selection({ cmd });
        return actions.set_syncstring_to_codemirror();
      });

    for (let cmd in keybindings) {
      const keys = keybindings[cmd];
      for (key of keys.split(" ")) {
        f(key, cmd);
      }
    }
  }

  if (opts.match_xml_tags) {
    extraKeys["Ctrl-J"] = "toMatchingTag";
  }

  if (feature.isMobile.Android()) {
    // see https://github.com/sragemathinc/smc/issues/1360
    opts.style_active_line = false;
  }

  const ext = filename_extension_notilde(filename);

  // Ugly until https://github.com/sagemathinc/cocalc/issues/2847 is implemented:
  if (["js", "jsx", "ts", "tsx", "json", "md", "r", "html"].includes(ext)) {
    opts.tab_size = opts.indent_unit = 2;
  }

  const options: any = {
    firstLineNumber: opts.first_line_number,
    autofocus: false,
    mode: { name: opts.mode, globalVars: true },
    lineNumbers: opts.line_numbers,
    showTrailingSpace: opts.show_trailing_whitespace,
    indentUnit: opts.indent_unit,
    tabSize: opts.tab_size,
    smartIndent: opts.smart_indent,
    electricChars: opts.electric_chars,
    undoDepth: opts.undo_depth,
    matchBrackets: opts.match_brackets,
    autoCloseBrackets: opts.auto_close_brackets && !["hs", "lhs"].includes(ext), //972
    autoCloseTags:
      opts.mode.indexOf("xml") !== -1 || opts.mode.indexOf("html") !== -1
        ? opts.auto_close_xml_tags
        : undefined,
    autoCloseLatex:
      opts.mode.indexOf("tex") !== -1 ? opts.auto_close_latex : undefined,
    leanSymbols: opts.mode.indexOf("lean") !== -1,
    lineWrapping: opts.line_wrapping,
    readOnly: opts.read_only,
    styleActiveLine: opts.style_active_line,
    indentWithTabs: !opts.spaces_instead_of_tabs,
    showCursorWhenSelecting: true,
    extraKeys,
    cursorScrollMargin: 3,
    viewportMargin: 10
  };

  if (opts.match_xml_tags) {
    options.matchTags = { bothTags: true };
  }

  if (opts.code_folding) {
    extraKeys["Ctrl-Q"] = cm => cm.foldCodeSelectionAware();
    extraKeys["Alt-Q"] = cm => cm.foldCodeSelectionAware();
    options.foldGutter = true;
    options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"];
  } else {
    options.gutters = ["CodeMirror-linenumbers"];
  }

  if (gutters) {
    for (let gutter_id of gutters) {
      options.gutters.push(gutter_id);
    }
  }

  if (opts.bindings != null && opts.bindings !== "standard") {
    options.keyMap = opts.bindings;
  }

  if (opts.theme != null && opts.theme !== "standard") {
    options.theme = opts.theme;
  }

  return options;
}

var tab_key = function(editor, spaces_instead_of_tabs) {
  if (editor.somethingSelected()) {
    return (CodeMirror as any).commands.defaultTab(editor);
  } else {
    if (spaces_instead_of_tabs) {
      return editor.tab_as_space();
    } else {
      return (CodeMirror as any).commands.defaultTab(editor);
    }
  }
};
