/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "./app-framework";

// Calling set_window_title will set the title, but also put a notification
// count to the left of the title; if called with no arguments just updates
// the count, maintaining the previous title.
export function notifyCount() {
  const mentions = redux.getStore("mentions");
  const account = redux.getStore("account");
  const news = redux.getStore("news");
  // we always count balance_alert as "1", since we don't even
  // know how many of them there are until querying stripe.
  return (
    (mentions?.getUnreadSize() ?? 0) +
    (account?.get("unread_message_count") ?? 0) +
    (news?.get("unread") ?? 0) +
    (account?.get("balance_alert") ? 1 : 0)
  );
}

let last_title: string = "";

export function set_window_title(title?: string): void {
  if (title == null) {
    title = last_title;
  }
  last_title = title;
  const u = notifyCount();
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
