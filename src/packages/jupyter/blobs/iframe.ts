/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Efficient backend processing of iframe srcdoc and general text/html messages.

MOTIVATION: Sage 3d graphics.
*/

import { decode } from "he";
//import { getLogger } from "@cocalc/backend/logger";
//const logger = getLogger("jupyter:blobs:iframe");

// see https://github.com/sagemathinc/cocalc/issues/4322
const MAX_HTML_SIZE = 10 ** 6;

// We use iframes to render html in a number of cases:
//  - if it starts with iframe
//  - if it has a whole page doctype
//  - if it has a <script> tag anywhere without a type -- since those are ignored by safe HTML
//    rendering; using an iframe is the only way.  This e.g., makes mpld3 work uses -- <script>!  https://github.com/sagemathinc/cocalc/issues/1934
//    and altair -- https://github.com/sagemathinc/cocalc/issues/4468 -- uses <script type="text/javascript"/>
//  - do NOT just render all html in an iframe, e.g., this would break bokeh, since one output creates the target elt,
//    and a different output uses javascript to render it, and this doesn't work with an iframe, of course.
export function is_likely_iframe(content: string): boolean {
  if (!content) {
    return false;
  }
  content = content.toLowerCase();
  if (
    content.includes("https://bokeh.org") &&
    content.includes("bk-notebook-logo")
  ) {
    // Do NOT use an iframe for bokeh no matter what, since this won't work properly.
    // Hopefully the above heuristic is sufficiently robust to detect but not overdetect.
    return false;
  }
  if (content.length >= MAX_HTML_SIZE) {
    // it'll just break anyways if we don't use an iframe -- if we do, there is hope.
    return true;
  }
  return (
    content.includes("bk-notebook-logo") ||
    content.startsWith("<iframe") ||
    content.includes("<!doctype html>") ||
    (content.includes("<html>") && content.includes("<head>")) ||
    content.includes("<script>") ||
    content.includes('<script type="text/javascript">')
  );
}

export function process(
  content: string,
  saveToBlobStore: (data: string, type: string, ipynb?: string) => string,
): string {
  const decodedContent = decode(content);
  const contentLower = decodedContent.toLowerCase();
  const i = contentLower.indexOf("<html>");
  const j = contentLower.lastIndexOf("</html>");
  // trim content to the part inside the html tags – keep it otherwise
  // this is necessary for wrapping inline html code like for
  // https://github.com/sagemathinc/cocalc/issues/4468
  let src = "";
  if (i != -1 && j != -1) {
    src = decodedContent.slice(i, j + "</html>".length);
  } else {
    src = `<html>${decodedContent}</html>`;
  }
  // logger.debug("process", { content, src });
  return saveToBlobStore(src, "text/html", content);
}
