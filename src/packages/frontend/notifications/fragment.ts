/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Fragment, { isPageFragment } from "@cocalc/frontend/misc/fragment-id";
import { NotificationFilter, isNotificationFilter } from "./mentions/types";

export function getNotificationFilterFromFragment():
  | NotificationFilter
  | undefined {
  const fragID = Fragment.get();
  if (isPageFragment(fragID)) {
    const { page } = fragID;
    if (isNotificationFilter(page)) {
      return page;
    }
  }
}
