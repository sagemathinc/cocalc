/*
Extra CodeMirror keybindings that are mainly aimed to make mobile
external keyboard devices more usable, e.g., iPad.

Basically, certain browsers intercept or don't properly send the control or cmd
keys to the browser javascript.  However, the option=alt key isn't used for
much, so we add it for many keyboard shortcuts here.
*/

import * as CodeMirror from "codemirror";

import { merge } from "smc-util/misc2";

export function extra_alt_keys(
  extraKeys: any,
  editor_actions: any,
  frame_id: string,
  opts: any
): void {
  merge(extraKeys, {
    "Shift-Alt-L": cm => cm.align_assignments(),
    "Alt-Z": cm => cm.undo(),
    "Shift-Alt-Z": cm => cm.redo(),
    "Alt-A": cm => cm.execCommand("selectAll"),
    "Shift-Alt-A": cm => cm.execCommand("selectAll"),
    "Shift-Alt-K": cm => cm.execCommand("killLine"),
    "Alt-D": cm => cm.execCommand("selectNextOccurrence"),
    "Alt-F": cm => cm.execCommand("find"),
    "Shift-Alt-F": cm => cm.execCommand("replace"),
    "Shift-Alt-R": cm => cm.execCommand("replaceAll"),
    "Shift-Alt-D": cm => cm.execCommand("duplicateLine"),
    "Alt-G": cm => cm.execCommand("findNext"),
    "Shift-Alt-G": cm => cm.execCommand("findPrev"),
    "Cmd-Up": cm => cm.execCommand("goPageUp"),
    "Cmd-Down": cm => cm.execCommand("goPageDown"),
    "Alt-K": cm => cm.execCommand("goPageUp"),
    "Alt-J": cm => cm.execCommand("goPageDown"),
    "Alt-P": cm => cm.execCommand("goLineUp"),
    "Alt-N": cm => cm.execCommand("goLineDown"),
    "Alt-L": cm => cm.execCommand("jumpToLine"),
    "Alt-C": () => editor_actions.copy(frame_id), // gets overwritten for vim mode, of course
    "Alt-X": () => editor_actions.cut(frame_id),
    "Alt-V": () => editor_actions.paste(frame_id),
    "Alt-S": () => editor_actions.save(true)
  });

  if (opts.bindings === "vim") {
    // An additional key to get to visual mode in vim (added for ipad Smart Keyboard)
    extraKeys["Alt-C"] = cm => {
      /* cast to any since it is a plugin */
      (CodeMirror as any).Vim.exitInsertMode(cm);
    };
    extraKeys["Alt-F"] = cm => {
      cm.execCommand("goPageDown");
    };
    extraKeys["Alt-B"] = cm => {
      cm.execCommand("goPageUp");
    };
  }
}
