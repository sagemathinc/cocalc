/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Keyboard event handler
*/

declare const $: any; // jQuery

import json from "json-stable-stringify";

import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { copy_without, merge } from "@cocalc/util/misc";
import { JupyterActions } from "./browser-actions";
import { commands, KeyboardCommand } from "./commands";
import { NotebookMode } from "@cocalc/jupyter/types";

export function keyCode_to_chr(keyCode: number): string {
  const chrCode = keyCode - 48 * Math.floor(keyCode / 48);
  return String.fromCharCode(96 <= keyCode ? chrCode : keyCode);
}

function is_equal(e1: KeyboardCommand, e2: KeyboardCommand): boolean {
  for (const field of ["which", "ctrl", "shift", "alt", "meta"]) {
    if (e1[field] !== e2[field]) {
      return false;
    }
  }
  return true;
}

let last_evt: any = undefined;

export function evt_to_obj(evt: any, mode: NotebookMode): KeyboardCommand {
  const obj: any = { which: evt.which };
  if (last_evt != null && is_equal(last_evt, evt)) {
    obj.twice = true;
    last_evt = undefined;
  } else {
    last_evt = evt;
  }
  for (const k of ["ctrl", "shift", "alt", "meta"]) {
    if (evt[k + "Key"]) {
      obj[k] = true;
    }
  }
  if (mode != null) {
    obj.mode = mode;
  }
  if (evt.which == 173) {
    // firefox sends 173 for the "-" key but everybody else sends 189
    // see https://github.com/sagemathinc/cocalc/issues/4467
    // See also https://stackoverflow.com/questions/18177818/why-jquerys-event-which-gives-different-results-in-firefox-and-chrome
    // and of course we should rewrite this entire file to use
    // evt.key instead of evt.which
    evt.which = 189;
  }
  if (evt.which == 59) {
    // firefox sends 59 for the "-" key but everybody else sends 186
    evt.which = 186;
  }
  return obj;
}

function evt_to_shortcut(evt: any, mode: NotebookMode): string {
  return json(evt_to_obj(evt, mode))!;
}

export function create_key_handler(
  jupyter_actions: JupyterActions,
  frame_actions: NotebookFrameActions,
  editor_actions: JupyterEditorActions,
): (e: any) => void {
  if (
    jupyter_actions == null ||
    frame_actions == null ||
    editor_actions == null
  ) {
    // just in case typescript misses something...
    throw Error("bug in create_key_handler");
  }
  let val: any;
  const shortcut_to_command: any = {};

  function add_shortcut(s: any, name: any, val: any) {
    if (s.mode == null) {
      for (const mode of ["escape", "edit"]) {
        add_shortcut(merge(s, { mode }), name, val);
      }
      return;
    }
    if (s.key != null) {
      // TODO: remove this when we switch from using event.which to event.key!
      s = copy_without(s, ["key"]);
    }
    shortcut_to_command[json(s)!] = { name, val };
    if (s.alt) {
      s = copy_without(s, "alt");
      s.meta = true;
      return add_shortcut(s, name, val);
    }
  }

  const object = commands({
    jupyter_actions,
    frame_actions,
    editor_actions,
  });

  for (const name in object) {
    val = object[name];
    if ((val != null ? val.k : undefined) == null) {
      continue;
    }
    for (const s of val.k) {
      add_shortcut(s, name, val);
    }
  }

  return (evt: any) => {
    if (jupyter_actions.store == null || frame_actions.store == null) {
      // Could happen after everything has been closed, but key handler isn't
      // quite removed.  https://github.com/sagemathinc/cocalc/issues/4462
      return;
    }
    if (jupyter_actions.store.get("complete") != null) {
      return;
    }
    const mode = frame_actions.store.get("mode");
    if (mode === "escape") {
      const focused = $(":focus");
      if (
        focused.length > 0 &&
        (focused[0].tagName != "DIV" ||
          focused[0].className?.includes("widget-readout"))
      ) {
        // Never use keyboard shortcuts when something is focused, e.g.,
        // getting a password or using text input widget.  However, the cell list DIV
        // itself gets focused often, so we have to avoid that special case.
        // An example with ipywidgets that the className case above covers:
        //   import ipywidgets as widgets; w = widgets.IntSlider(0,1,100); w
        // Then put your cursor in the number to the right of the slider and hit backspace.
        return;
      }
    }
    const shortcut = evt_to_shortcut(evt, mode);
    const cmd = shortcut_to_command[shortcut];

    if (cmd != null) {
      last_evt = undefined;
      cmd.val.f();
      return false;
    }
  };
}
