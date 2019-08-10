/*
Keyboard event handler
*/

declare const $: any; // jQuery

import * as json from "json-stable-stringify";
import { merge, copy_without } from "../../smc-util/misc";
import { KeyboardCommand, commands } from "./commands";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";
import { NotebookMode } from "./types";

export function keyCode_to_chr(keyCode: number): string {
  const chrCode = keyCode - 48 * Math.floor(keyCode / 48);
  return String.fromCharCode(96 <= keyCode ? chrCode : keyCode);
}

function is_equal(e1: KeyboardCommand, e2: KeyboardCommand): boolean {
  for (let field of ["which", "ctrl", "shift", "alt", "meta"]) {
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
  for (let k of ["ctrl", "shift", "alt", "meta"]) {
    if (evt[k + "Key"]) {
      obj[k] = true;
    }
  }
  if (mode != null) {
    obj.mode = mode;
  }
  return obj;
}

function evt_to_shortcut(evt: any, mode: NotebookMode): string {
  return json(evt_to_obj(evt, mode));
}

export function create_key_handler(
  jupyter_actions: JupyterActions,
  frame_actions: NotebookFrameActions
): Function {
  let val: any;
  const shortcut_to_command: any = {};

  function add_shortcut(s: any, name: any, val: any) {
    if (s.mode == null) {
      for (let mode of ["escape", "edit"]) {
        add_shortcut(merge(s, { mode }), name, val);
      }
      return;
    }
    shortcut_to_command[json(s)] = { name, val };
    if (s.alt) {
      s = copy_without(s, "alt");
      s.meta = true;
      return add_shortcut(s, name, val);
    }
  }

  const object = commands(jupyter_actions, frame_actions);
  for (let name in object) {
    val = object[name];
    if ((val != null ? val.k : undefined) == null) {
      continue;
    }
    for (let s of val.k) {
      add_shortcut(s, name, val);
    }
  }

  return (evt: any) => {
    if (jupyter_actions.store.get("complete") != null) {
      return;
    }
    const mode = frame_actions.store.get("mode");
    if (mode === "escape") {
      const focused = $(":focus");
      if (
        focused.length > 0 &&
        focused[0].className.indexOf("ReactVirtualized") == -1
      ) {
        // Never use keyboard shortcuts when something is focused, e.g.,
        // getting a password or using text input widget.  However, ReactVirtualized
        // itself gets focused often, so we have to avoid that special case.
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
