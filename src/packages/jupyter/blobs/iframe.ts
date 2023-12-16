/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Efficient backend processing of iframe srcdoc and general text/html messages.

MOTIVATION: Sage 3d graphics.
*/

import { decode } from "he";
//import { getLogger } from "@cocalc/backend/logger";
//const logger = getLogger("jupyter:blobs:iframe");

export function is_likely_iframe(content: string): boolean {
  if (!content) {
    return false;
  }
  content = content.slice(0, 100).trim().toLowerCase();
  return (
    content.startsWith("<iframe") ||
    content.includes("<!doctype html>") ||
    (content.includes("<html>") && content.includes("<head>")) ||
    // special case "altair" inline html -- https://github.com/sagemathinc/cocalc/issues/4468
    content.includes('id="altair-viz-')
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
