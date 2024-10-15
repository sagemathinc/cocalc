/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Fragment from "@cocalc/frontend/misc/fragment-id";
import { NotificationFilter, isNotificationFilter } from "./mentions/types";

export function getNotificationFilterFromFragment():
  | NotificationFilter
  | undefined {
  const fragmentId = Fragment.get();
  if (fragmentId == null) {
    return;
  }
  const { page } = fragmentId;
  if (!page) {
    return;
  }
  if (isNotificationFilter(page)) {
    return page;
  }
}
