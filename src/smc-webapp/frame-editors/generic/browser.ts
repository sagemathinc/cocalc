/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as jQuery from "jquery";

export function is_safari(): boolean {
  const $: any = jQuery;
  if ($.browser !== undefined && $.browser.safari) {
    return true;
  } else {
    return false;
  }
}
