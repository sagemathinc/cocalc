/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
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
  const intl = useIntl();
  let text = "No new mentions";
  switch (filter) {
    case "unread":
      text = intl.formatMessage({
        id: "notifications.no-mentions.unread",
        defaultMessage: "No unread mentions",
      });
      break;
    case "read":
      text = intl.formatMessage({
        id: "notifications.no-mentions.read",
        defaultMessage: "No read mentions",
      });
      break;
    case "saved":
      text = intl.formatMessage({
        id: "notifications.no-mentions.saved",
        defaultMessage: "No saved mentions",
      });
      break;
    case "all":
      text = intl.formatMessage({
        id: "notifications.no-mentions.all",
        defaultMessage: "No mentions",
      });
      break;
    default:
      unreachable(filter);
  }
  return <NoNewNotifications text={text} style={style} />;
}
