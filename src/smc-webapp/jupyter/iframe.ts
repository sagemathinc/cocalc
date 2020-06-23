/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Efficient backend processing of iframe srcdoc's.

MOTIVATION: Sage jmol.
*/

const misc = require("smc-util/misc"); // TODO: import type

export function is_likely_iframe(content: string): boolean {
  if (!content) {
    return false;
  }
  content = content.slice(0, 100).trim().toLowerCase();
  return (
    misc.startswith(content, '<iframe srcdoc="') ||
    content.indexOf("<!doctype html>") >= 0 ||
    (content.indexOf("<html>") >= 0 && content.indexOf("<head>") >= 0)
  );
}

export function process(content: string, blob_store: any) {
  // TODO: type
  const content_lower = content.toLowerCase();
  const i = content_lower.indexOf("<html>");
  const j = content_lower.lastIndexOf("</html>");
  const src = unescape(content.slice(i, j + "</html>".length));
  return blob_store.save(src, "text/html", content);
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
