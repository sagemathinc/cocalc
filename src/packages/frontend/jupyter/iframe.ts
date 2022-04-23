/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Efficient backend processing of iframe srcdoc and general text/html messages.

MOTIVATION: Sage jmol.
*/

import { BlobStoreInterface } from "./project-interface";

const misc = require("@cocalc/util/misc"); // TODO: import type

export function is_likely_iframe(content: string): boolean {
  if (!content) {
    return false;
  }
  content = content.slice(0, 100).trim().toLowerCase();
  return (
    misc.startswith(content, "<iframe") ||
    content.indexOf("<!doctype html>") >= 0 ||
    (content.indexOf("<html>") >= 0 && content.indexOf("<head>") >= 0) ||
    // special case "altair" inline html -- https://github.com/sagemathinc/cocalc/issues/4468
    content.indexOf('id="altair-viz-') >= 0
  );
}

export function process(
  content: string,
  blob_store: BlobStoreInterface | undefined
) {
  // TODO: type
  const content_lower = content.toLowerCase();
  const i = content_lower.indexOf("<html>");
  const j = content_lower.lastIndexOf("</html>");
  // trim content to the part inside the html tags – keep it otherwise
  // this is necessary for wrapping inline html code like for
  // https://github.com/sagemathinc/cocalc/issues/4468
  let src = "";
  if (i != -1 && j != -1) {
    src = content.slice(i, j + "</html>".length);
  } else {
    src = `<html>${content}</html>`;
  }
  return blob_store?.save?.(unescape(src), "text/html", content);
}

const entity_map = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

var unescape = function (s: string) {
  for (const k in entity_map) {
    const v = entity_map[k];
    s = misc.replace_all(s, v, k);
  }
  return s;
};
