/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Fragment from "@cocalc/frontend/misc/fragment-id";
import { NotificationFilter, isNotificationFilter } from "./mentions/types";

export function getNotificationFilterFromFragment(hash?): {
  filter: NotificationFilter;
  id?: number;
} {
  const fragmentId = hash ? Fragment.decode(hash) : Fragment.get();
  if (fragmentId == null) {
    return { filter: "messages-inbox" as NotificationFilter };
  }
  const { page: filter, id: id0 } = fragmentId;
  if (filter != null && isNotificationFilter(filter)) {
    let id: number | undefined = undefined;
    try {
      if (id0 != null) {
        id = parseInt(id0);
      }
    } catch (_err) {}
    if (filter == "messages-search") {
      return { filter: "messages-all", id };
    }
    return { filter, id };
  }
  return { filter: "messages-inbox" as NotificationFilter };
}
