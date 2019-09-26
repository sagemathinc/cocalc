/*
Efficient backend processing of iframe srcdoc's.

MOTIVATION: Sage jmol.
*/

const misc = require("smc-util/misc"); // TODO: import type

//function contains_audio(content: string): boolean {
//  return (
//    content.indexOf("data:audio") >= 0 &&
//    content.indexOf("<source src=") >= 0 &&
//    content.indexOf("<audio") >= 0
//  );
//}

export function is_likely_iframe(content: string): boolean {
  if (!content) {
    return false;
  }
  content = content
    .slice(0, 100)
    .trim()
    .toLowerCase();
  return (
    misc.startswith(content, '<iframe srcdoc="') ||
    content.indexOf("<!doctype html>") >= 0 ||
    (content.indexOf("<html>") >= 0 && content.indexOf("<head>") >= 0)
    // ||    contains_audio(content)
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
  "=": "&#x3D;"
};

var unescape = function(s: string) {
  for (let k in entity_map) {
    const v = entity_map[k];
    s = misc.replace_all(s, v, k);
  }
  return s;
};
