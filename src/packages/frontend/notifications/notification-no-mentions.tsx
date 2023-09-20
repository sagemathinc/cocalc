/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";
import { unreachable } from "@cocalc/util/misc";
import { MentionsFilter } from "./mentions/types";
import { NoNewNotifications } from "./no-new-notifications";

interface NoMentionsProps {
  filter: MentionsFilter;
  style: CSS;
}

export function NoMentions(props: NoMentionsProps) {
  const { filter, style } = props;
  let text = "No new mentions";
  switch (filter) {
    case "unread":
      text = "No unread mentions";
      break;
    case "read":
      text = "No read mentions";
      break;
    case "saved":
      text = "No saved mentions";
      break;
    case "all":
      text = "No mentions";
      break;
    default:
      unreachable(filter);
  }
  return <NoNewNotifications text={text} style={style} />;
}
