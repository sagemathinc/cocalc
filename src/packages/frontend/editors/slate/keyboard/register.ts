/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Plugin system for keyboarding handlers.

export { IS_MACOS } from "@cocalc/frontend/feature";

import { SlateEditor } from "../editable-markdown";
import { Actions } from "../types";
import { SearchHook } from "../search";

interface Key {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}

function EventToString(e): string {
  // e is a keyboard event
  return `${e.shiftKey}${e.ctrlKey}${e.metaKey}${e.altKey}${e.key}`;
}

function KeyToString(k: Key): string {
  return `${!!k.shift}${!!k.ctrl}${!!k.meta}${!!k.alt}${k.key}`;
}

// Function that returns true if it handles the key
// or false-ish to fallback to default behavior.
export type KeyHandler = (opts: {
  editor: SlateEditor;
  extra: { actions: Actions; id: string; search: SearchHook };
}) => boolean;

const keyHandlers: { [x: string]: KeyHandler } = {};

export function register(
  key: Partial<Key> | Partial<Key>[],
  handler: KeyHandler,
): void {
  const handlerNoThrow = (opts) => {
    try {
      return handler(opts);
    } catch (err) {
      // making this a warning -- there's a number of situations where the
      // it's best to just not do anything special, rather than crash cocalc.
      console.log("slate key handler throw ", key, err);
      return false;
    }
  };

  if (key[0] != null) {
    for (const k of key as Partial<Key>[]) {
      register(k, handlerNoThrow);
    }
    return;
  }

  const s = KeyToString(key as Key);
  if (keyHandlers[s] != null) {
    // making this a warning to support hot module reloading.
    console.warn(`WARNING: there is already a handler registered for ${s}`);
  }
  keyHandlers[s] = handlerNoThrow;
}

export function getHandler(event): KeyHandler | undefined {
  // console.log(event.key);
  return keyHandlers[EventToString(event)];
}
