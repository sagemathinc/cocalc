/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */

import {
  IS_WIN32,
  CHARCODE_TO_NAME,
  NUMPAD_TO_NAME,
  KEY_TO_NAME,
  CHAR_TO_NAME,
  KEYSYM_TO_LAYOUT,
  DOM_KEY_LOCATION_RIGHT
} from "./constants.js";

const modifierMap = {
  altKey: "alt",
  ctrlKey: "control",
  metaKey: "meta",
  shiftKey: "shift"
};

const getEventModifiers = ev =>
  Object.keys(modifierMap)
    .filter(key => ev[key])
    .map(key => modifierMap[key]);

const translateModifiers = modifiers => {
  // TODO
  return modifiers;
};

const getModifiers = (ev, capsLock, numLock) => {
  const modifiers = getEventModifiers(event);
  if (capsLock) {
    modifiers.push("lock");
  }

  if (numLock) {
    modifiers.push("numlock"); // FIXME
  }

  return translateModifiers(modifiers);
};

/**
 * This function is only used for figuring out the caps_lock state!
 * onkeyup and onkeydown give us the raw keycode,
 * whereas here we get the keycode in lowercase/uppercase depending
 * on the caps_lock and shift state, which allows us to figure
 * out caps_lock state since we have shift state.
 */
const getCapsLockState = (ev, shift) => {
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
export const createKeyboard = send => {
  const swapKeys = false; // TODO
  let capsLock = false;
  let numLock = false;
  let altGr = false;

  const getMods = ev => getModifiers(ev, capsLock, numLock);

  const process = (ev, surface) => {
    const topwindow = surface ? surface.wid : 0;
    const rawModifiers = getEventModifiers(ev);
    const modifiers = getMods(ev);
    const shift = modifiers.includes("shift");

    if (ev.type === "keydown" || ev.type === "keyup") {
      const keycode = ev.which || event.keyCode;

      // this usually fires when we have received the event via "oninput" already
      if (keycode === 229) {
        return false;
      }

      const group = 0;
      const pressed = ev.type === "keydown";

      // sync numlock
      if (keycode === 144 && pressed) {
        numLock = !numLock;
      }

      let str = event.key || String.fromCharCode(keycode);
      let keyname = ev.code || "";

      if (keyname != str && str in NUMPAD_TO_NAME) {
        keyname = NUMPAD_TO_NAME[str];
        numLock = "0123456789.".includes(keyname);
      } else if (keyname in KEY_TO_NAME) {
        // some special keys are better mapped by name:
        keyname = KEY_TO_NAME[keyname];
      } else if (str in CHAR_TO_NAME) {
        // next try mapping the actual character
        keyname = CHAR_TO_NAME[str];

        /* TODO
        if (keyname.includes('_')) {
          // ie: Thai_dochada
          const lang = keyname.split('_')[0];
          keylang = KEYSYM_TO_LAYOUT[lang];
        }
        */
      } else if (keycode in CHARCODE_TO_NAME) {
        // fallback to keycode map:
        keyname = CHARCODE_TO_NAME[keycode];
      }

      if (keyname.match("_L$") && ev.location === DOM_KEY_LOCATION_RIGHT) {
        keyname = keyname.replace("_L", "_R");
      }

      // AltGr: keep track of pressed state
      if (str == "AltGraph" || (keyname === "Alt_R" && IS_WIN32)) {
        altGr = pressed;
        keyname = "ISO_Level3_Shift";
        str = "AltGraph";
      }

      if ((capsLock && shift) || (!capsLock && !shift)) {
        str = str.toLowerCase();
      }

      const oldStr = str;
      if (swapKeys) {
        if (keyname === "Control_L") {
          keyname = "Meta_L";
          str = "meta";
        } else if (keyname === "Meta_L") {
          keyname = "Control_L";
          str = "control";
        } else if (keyname === "Control_R") {
          keyname = "Meta_R";
          str = "meta";
        } else if (keyname === "Meta_R") {
          keyname = "Control_R";
          str = "control";
        }
      }

      send(
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
        swapKeys &&
        rawModifiers.includes("meta") &&
        oldStr !== "meta"
      ) {
        send(
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
      capsLock = getCapsLockState(ev, shift);

      return true;
    }

    return false;
  };

  return { modifiers: getMods, process };
};
