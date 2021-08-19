/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
declare var $: any;

// Cause a file at a given url to get downloaded... using an iframe.  Don't await this.
export async function download_file(src: string): Promise<void> {
  // NOTE: the file has to be served with
  //    res.setHeader('Content-disposition', 'attachment')

  // Create hidden iframe that causes download to happen:
  const iframe = $("<iframe>")
    .addClass("hide")
    .attr("src", src)
    .appendTo($("body"));

  // Wait a minute...
  await delay(60000);

  // Then get rid of that iframe
  iframe.remove();
}

// These are used to disable pointer events for iframes when
// dragging something that may move over an iframe.   See 
// http://stackoverflow.com/questions/3627217/jquery-draggable-and-resizeable-over-iframes-solution
export function drag_start_iframe_disable() {
  return $("iframe:visible").css("pointer-events", "none");
}

export function drag_stop_iframe_enable() {
  return $("iframe:visible").css("pointer-events", "auto");
}
