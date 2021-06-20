/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { QueryParams } from "../misc/query-params";
import { target } from "smc-webapp/client/handle-hash-url";

declare var $: any;

/*
Misc random code that I don't really know how to classify further.  It's misc
among misc...
*/

export function html_to_text(html: string): string {
  return $($.parseHTML(html)).text();
}

// returns true, if a target page should be loaded
export function should_load_target_url(): boolean {
  return target != null && target != "login" && !QueryParams.get("test");
}
