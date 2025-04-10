/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import target from "@cocalc/frontend/client/handle-target";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import $ from "jquery";

/*
Misc random code that I don't really know how to classify further.  It's misc
among misc...
*/

export function html_to_text(html: string): string {
  return $($.parseHTML(html)).text();
}

// returns true, if a target page should be loaded
export function should_load_target_url(): boolean {
  return (
    target != null &&
    target != "login" &&
    !QueryParams.get("test") &&
    !QueryParams.get("get_api_key")
  );
}
