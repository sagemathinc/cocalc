/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
An internal copy/paste buffer

MOTIVATION: There is no way to sync with the official operating system copy/paste buffer,
due to security restrictions.  However, for some platforms (iPad, I'm looking at you!),
it's still very useful to have our own internal copy/paste buffer.  This is it.
It stores a string right now.  Who knows, maybe someboday it'll do interesting
richer content too.
*/

let buffer = "";

// TODO: get_buffer could be done via a permission request, though that is a potential security issue.
// See https://alligator.io/js/async-clipboard-api/
export function get_buffer(): string {
  return buffer;
}

export function set_buffer(s: string | undefined): void {
  buffer = s ?? "";

  // In addition to saving the test to our own internal buffer (that get_buffer produces),
  // we also attempt to write that buffer to the actual clipboard.  In some cases this might
  // work and produces a better user experience.
  if (navigator.clipboard != null) {
    // this is async -- requires at least chrome 66.
    navigator.clipboard.writeText(buffer);
    return;
  }
  // failing that, try to copy what is selected to the internal buffer...
  try {
    // https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
    // This ignores the input s above, since it operates on whatever is selected.
    // NOTE: there might be no context in CoCalc where this will actually work, since
    // it is supposed to be used in an event handler (like in the x11 xpra code?).
    document.execCommand("copy");
  } catch (_) {}
}
