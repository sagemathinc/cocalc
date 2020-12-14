/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */


declare var $: any;

/*
Misc random code that I don't really know how to classify further.  It's misc
among misc...
*/

export function html_to_text(html: string): string {
  return $($.parseHTML(html)).text();
}
