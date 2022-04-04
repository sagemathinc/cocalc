import { Element } from "../types";
import copy from "copy-to-clipboard";

// Used for some devices where I just haven't figured out paste yet, e.g., ipad.
let internalBuffer = "";

export function copyToClipboard(elements: Element[]): void {
  copy(encodeForCopy(elements));
}

export function pasteFromInternalClipboard(): Element[] {
  return decodeForPaste(internalBuffer);
}

export function encodeForCopy(elements: Element[]): string {
  const encoded = window.btoa(encodeURIComponent(JSON.stringify(elements)));
  internalBuffer = encoded;
  return encoded;
}

export function decodeForPaste(encoded: string): Element[] {
  try {
    return JSON.parse(decodeURIComponent(window.atob(encoded)));
  } catch (_err) {
    return [];
  }
}
