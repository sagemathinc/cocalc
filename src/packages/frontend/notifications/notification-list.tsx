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
  let body;
  if (isNewsFilter(filter)) {
    body = <NewsPanel news={news} filter={filter} />;
  } else if (isMessagesFilter(filter)) {
    body = <Messages filter={filter} />;
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
  }

  return (
    <div className={"smc-notificationlist"} style={style}>
      {body}
    </div>
  );
};
