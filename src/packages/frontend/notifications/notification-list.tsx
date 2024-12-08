/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import { MentionsMap, NotificationFilter } from "./mentions/types";
import { NewsMap, isNewsFilter } from "./news/types";
import { MentionsPanel } from "./notification-mentions";
import { NewsPanel } from "./notification-news";
import Messages, { isMessagesFilter } from "@cocalc/frontend/messages";

interface Props {
  account_id: string;
  mentions: MentionsMap;
  news: NewsMap;
  filter: NotificationFilter;
  style: CSS;
  user_map;
}

export const NotificationList: React.FC<Props> = ({
  account_id,
  mentions,
  news,
  filter,
  style,
  user_map,
}: Props) => {
  let body, className;
  if (isNewsFilter(filter)) {
    body = <NewsPanel news={news} filter={filter} />;
    className = "smc-notificationlist";
  } else if (isMessagesFilter(filter)) {
    body = <Messages filter={filter} />;
    // ATTENTION: this smc-notificationlist that harald wrote for some reason
    // completely breaks markdown rendering, since it's a css rule that completely
    // changes has lists are rendered everywhere below.  Thus we absolutely cannot
    // apply it at the top level.
    className = undefined;
  } else {
    body = (
      <MentionsPanel
        filter={filter}
        mentions={mentions}
        account_id={account_id}
        user_map={user_map}
        style={style}
      />
    );
    className = "smc-notificationlist";
  }

  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
};
