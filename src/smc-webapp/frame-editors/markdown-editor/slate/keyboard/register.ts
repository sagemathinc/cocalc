/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Plugin system for keyboarding handlers.

import { Editor } from "slate";

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
export type KeyHandler = (editor: Editor) => boolean;

const keyHandlers: { [x: string]: KeyHandler } = {};

export function register(key: Partial<Key>, handler: KeyHandler): void {
  const s = KeyToString(key as Key);
  if (keyHandlers[s] != null) {
    throw Error(`BUG: there is already a handler registered for ${s}`);
  }
  keyHandlers[s] = handler;
}

export function getHandler(event): KeyHandler | undefined {
  return keyHandlers[EventToString(event)];
}
