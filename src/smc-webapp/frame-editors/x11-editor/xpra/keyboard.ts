/**
 * CoCalc Xpra Client
 */

import { Surface } from "./types";

import { browserLanguage, keyboardLayout, timestamp } from "./util";

import {
  IS_OSX,
  IS_WIN32,
  CHARCODE_TO_NAME,
  NUMPAD_TO_NAME,
  KEY_TO_NAME,
  CHAR_TO_NAME,
  KEYSYM_TO_LAYOUT,
  DOM_KEY_LOCATION_RIGHT
} from "./constants";

const modifierMap = {
  altKey: "alt",
  ctrlKey: "control",
  metaKey: "meta",
  shiftKey: "shift"
};

function getEventModifiers(ev: KeyboardEvent | MouseEvent): string[] {
  const modifiers: string[] = [];
  for (let key in modifierMap) {
    if (ev[key]) {
      modifiers.push(modifierMap[key]);
    }
  }
  return modifiers;
}

function translateModifiers(modifiers: string[], swapKeys: boolean): string[] {
  /**
   * We translate "alt" and "meta" into their keymap name.
   * (usually "mod1")
   * And also swap keys for macos clients.
   */
  //convert generic modifiers "meta" and "alt" into their x11 name:
  //FIXME: look them up!
  const alt = "mod1";
  let meta = "mod1";
  let control = "control";
  //swap
  if (swapKeys) {
    meta = "control";
    control = "mod1";
  }
  const new_modifiers = modifiers.slice();
  let index = modifiers.indexOf("alt");
  if (index >= 0) new_modifiers[index] = alt;
  index = modifiers.indexOf("meta");
  if (index >= 0) new_modifiers[index] = meta;
  index = modifiers.indexOf("control");
  if (index >= 0) new_modifiers[index] = control;
  //show("get_modifiers() modifiers="+modifiers.toSource());
  return new_modifiers;
}

function getModifiers(
  ev: KeyboardEvent | MouseEvent,
  capsLock: boolean,
  numLock: boolean,
  swapKeys: boolean
): string[] {
  const modifiers = getEventModifiers(ev);
  if (capsLock) {
    modifiers.push("lock");
  }

  if (numLock) {
    modifiers.push("numlock"); // FIXME
  }

  return translateModifiers(modifiers, swapKeys);
}

/**
 * This function is only used for figuring out the caps_lock state!
 * onkeyup and onkeydown give us the raw keycode,
 * whereas here we get the keycode in lowercase/uppercase depending
 * on the caps_lock and shift state, which allows us to figure
 * out caps_lock state since we have shift state.
 */
const getCapsLockState = (ev: KeyboardEvent, shift) => {
  const keycode = ev.which || ev.keyCode;

  /* PITA: this only works for keypress event... */
  if (keycode >= 97 && keycode <= 122 && shift) {
    return true;
  } else if (keycode >= 65 && keycode <= 90 && !shift) {
    return true;
  }

  return false;
};

/**
 * Creates the keyboard input handler
 */
export class Keyboard {
  private swapKeys: boolean = IS_OSX;
  private capsLock: boolean = false;
  private numLock: boolean = false;
  private altGr: boolean = false;
  private send: Function;
  private browser_language_change_embargo_time: number = 0;
  private key_layout: string | null = null;
  private browser_language: string = browserLanguage();

  constructor(send: Function) {
    this.send = send;
  }

  modifiers(ev: KeyboardEvent | MouseEvent): string[] {
    return getModifiers(ev, this.capsLock, this.numLock, this.swapKeys);
  }

  process(ev: KeyboardEvent, surface: Surface): boolean {
    const topwindow = surface ? surface.wid : 0;
    const rawModifiers = getEventModifiers(ev);
    const modifiers = this.modifiers(ev);
    const shift = modifiers.includes("shift");

    if (ev.type === "keydown" || ev.type === "keyup") {
      const keycode = ev.which || ev.keyCode;

      // this usually fires when we have received the event via "oninput" already
      if (keycode === 229) {
        return false;
      }

      const group = 0;
      const pressed = ev.type === "keydown";

      // sync numlock
      if (keycode === 144 && pressed) {
        this.numLock = !this.numLock;
      }

      let str = ev.key || String.fromCharCode(keycode);
      let keyname = ev.code || "";

      if (keyname != str && str in NUMPAD_TO_NAME) {
        keyname = NUMPAD_TO_NAME[str];
        this.numLock = "0123456789.".includes(keyname);
      } else if (keyname in KEY_TO_NAME) {
        // some special keys are better mapped by name:
        keyname = KEY_TO_NAME[keyname];
      } else if (str in CHAR_TO_NAME) {
        // next try mapping the actual character
        keyname = CHAR_TO_NAME[str];
        if (keyname.indexOf("_") > 0) {
          //ie: Thai_dochada
          const lang = keyname.split("_")[0];
          this.checkBrowserLanguage(KEYSYM_TO_LAYOUT[lang]);
        }
      } else if (keycode in CHARCODE_TO_NAME) {
        // fallback to keycode map:
        keyname = CHARCODE_TO_NAME[keycode];
      }

      if (keyname.match("_L$") && ev.location === DOM_KEY_LOCATION_RIGHT) {
        keyname = keyname.replace("_L", "_R");
      }

      // AltGr: keep track of pressed state
      // TODO: this is never used anywhere yet.
      if (str == "AltGraph" || (keyname === "Alt_R" && IS_WIN32)) {
        this.altGr = pressed;
        keyname = "ISO_Level3_Shift";
        str = "AltGraph";
        console.log("altGr = ", this.altGr);
      }

      if ((this.capsLock && shift) || (!this.capsLock && !shift)) {
        str = str.toLowerCase();
      }

      const oldStr = str;
      if (this.swapKeys) {
        switch (keyname) {
          case "Control_L":
            keyname = "Meta_L";
            str = "meta";
            break;
          case "Meta_L":
            keyname = "Control_L";
            str = "control";
            break;
          case "Control_R":
            keyname = "Meta_R";
            str = "meta";
            break;
          case "Meta_R":
            keyname = "Control_R";
            str = "control";
            break;
        }
      }

      this.send(
        "key-action",
        topwindow,
        keyname,
        pressed,
        modifiers,
        keycode,
        str,
        keycode,
        group
      );

      // macos will swallow the key release event if the meta modifier is pressed,
      // so simulate one immediately:
      if (
        pressed &&
        this.swapKeys &&
        rawModifiers.includes("meta") &&
        oldStr !== "meta"
      ) {
        this.send(
          "key-action",
          topwindow,
          keyname,
          false,
          modifiers,
          keycode,
          str,
          keycode,
          group
        );
      }

      return true;
    } else if (ev.type === "keypress") {
      this.capsLock = getCapsLockState(ev, shift);

      return true;
    }

    return false;
  }

  private checkBrowserLanguage(key_layout: string | undefined): void {
    /**
     * Use the "key_layout" if we have it;
     * otherwise, use the browser's language.
     * This function may send a new detected keyboard layout.
     * (ignoring the keyboard_layout preference)
     */
    const now = timestamp();
    if (now < this.browser_language_change_embargo_time) {
      return;
    }
    let new_layout: string | null = null;
    if (key_layout && this.key_layout != key_layout) {
      console.log(
        "input language changed from",
        this.key_layout,
        "to",
        key_layout
      );
      this.key_layout = new_layout = key_layout;
    } else {
      const l = browserLanguage();
      if (l && this.browser_language != l) {
        new_layout = keyboardLayout();
        console.log(
          "browser language changed from",
          this.browser_language,
          "to",
          l,
          ", sending new keyboard layout:",
          new_layout
        );
        this.browser_language = l;
      }
    }
    if (new_layout != null) {
      this.send(["layout-changed", new_layout, ""]);
      //changing the language too quickly can cause problems server side,
      //wait at least 2 seconds before checking again:
      this.browser_language_change_embargo_time = now + 2000;
    } else {
      //check again after 100ms minimum
      this.browser_language_change_embargo_time = now + 100;
    }
  }
}
