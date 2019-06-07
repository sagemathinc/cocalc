/*
Various logic depends on filename extensions, so it is good to centralize that to avoid
duplicating code.  What's below may be pretty dumb though (and we should use some
mimetype library)...

*/

import {
  file_associations,
  VIDEO_EXTS,
  AUDIO_EXTS
} from "../file-associations";

// see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
export const image = new Set([
  "png",
  "jpg",
  "gif",
  "svg",
  "jpeg",
  "bmp",
  "apng",
  "ico"
]);

// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video
export let video = new Set(VIDEO_EXTS);
export let audio = new Set(AUDIO_EXTS);

export let pdf = new Set(["pdf"]);

export let html = new Set(["html", "htm"]);

const cm = {};
for (let ext in file_associations) {
  // TODO: more?
  const info = file_associations[ext];
  if (info && (info.editor === "codemirror" || info.editor === "latex")) {
    cm[ext] = { mode: { name: info.opts.mode } };
  }
}

export { cm as codemirror };
