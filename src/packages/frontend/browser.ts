/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "./app-framework";

// Calling set_window_title will set the title, but also put a notification
// count to the left of the title; if called with no arguments just updates
// the count, maintaining the previous title.
type NotifyFunction = () => number;
let notify_count: NotifyFunction | undefined = undefined;

export function set_notify_count_function() {
  const store = redux.getStore("file_use");
  if (store == null) throw Error("file_use must be defined");
  notify_count = store?.get_notify_count;
}

let last_title: string = "";

export function set_window_title(title?: string): void {
  if (title == null) {
    title = last_title;
  }
  last_title = title;
  const u = notify_count?.();
  if (u) {
    title = `(${u}) ${title}`;
  }
  const site_name = redux.getStore("customize").get("site_name");
  if (title.length > 0) {
    document.title = title + " - " + site_name;
  } else {
    document.title = site_name;
  }
}
