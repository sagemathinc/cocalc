/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
declare var $: any;

/*

Misc random code that I don't really know how to classify further.  It's misc
among misc...

*/

// Cause a file at a given url to get downloaded.  Don't await this.
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
