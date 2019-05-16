/*
Keyboard event handler
*/

const json = require("json-stable-stringify"); // TODO: import types
const { merge, copy_without } = require("smc-util/misc"); // TODO: import types
const commands = require("./commands"); // TODO: import types

export function keyCode_to_chr(keyCode: number) {
  const chrCode = keyCode - 48 * Math.floor(keyCode / 48);
  return String.fromCharCode(96 <= keyCode ? chrCode : keyCode);
}

const is_equal = function(e1: any, e2: any) {
  // TODO: type
  for (let field of ["which", "ctrl", "shift", "alt", "meta"]) {
    if (e1[field] !== e2[field]) {
      return false;
    }
  }
  return true;
};

let last_evt: any = undefined;

export function evt_to_obj(evt: any, mode: any) {
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

function evt_to_shortcut(evt: any, mode: any) {
  return json(evt_to_obj(evt, mode));
}

export function create_key_handler(actions: any) : Function {
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

  const object = commands.commands(actions);
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
    if (actions.store.get("complete") != null) {
      return;
    }
    const mode = actions.store.get("mode");
    console.log("mode = ", mode);
    const shortcut = evt_to_shortcut(evt, mode);
    const cmd = shortcut_to_command[shortcut];
    // console.log 'shortcut', shortcut, cmd
    if (cmd != null) {
      last_evt = undefined;
      cmd.val.f();
      return false;
    }
  };
}
