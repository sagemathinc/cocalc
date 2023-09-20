/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import { MentionsMap, NotificationFilter } from "./mentions/types";
import { NewsMap, isNewsFilter } from "./news/types";
import { MentionsPanel } from "./notification-mentions";
import { NewsPanel } from "./notification-news";

interface Props {
  account_id: string;
  mentions: MentionsMap;
  news: NewsMap;
  filter: NotificationFilter;
  style: CSS;
  user_map;
}

export const NotificationList: React.FC<Props> = (props: Props) => {
  const { account_id, mentions, news, filter, style, user_map } = props;

  return (
    <div className={"smc-notificationlist"} style={style}>
      {isNewsFilter(filter) ? (
        <NewsPanel news={news} filter={filter} />
      ) : (
        <MentionsPanel
          filter={filter}
          mentions={mentions}
          account_id={account_id}
          user_map={user_map}
          style={style}
        />
      )}
    </div>
  );
};
