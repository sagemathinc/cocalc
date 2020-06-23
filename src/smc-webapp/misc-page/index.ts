/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare var $: any;

export { open_new_tab, open_popup_window } from "./open-browser-tab";

export function html_to_text(html: string): string {
  return $($.parseHTML(html)).text();
}
