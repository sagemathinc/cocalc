/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Empty, Flex } from "antd";
import React, { useEffect } from "react";
import { useIntl } from "react-intl";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Loading, Paragraph, Title } from "@cocalc/frontend/components";
// TODO: i18n again...
//import { labels } from "@cocalc/frontend/i18n";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { COLORS } from "@cocalc/util/theme";
import { NotificationFilter } from "./mentions/types";
import { NotificationList } from "./notification-list";
import { NotificationNav } from "./notification-nav";

export const NotificationPage: React.FC<{}> = () => {
  const intl = useIntl();
  const account_id = useTypedRedux("account", "account_id");
  const mentions = useTypedRedux("mentions", "mentions");
  const news = useTypedRedux("news", "news");
  const user_map = useTypedRedux("users", "user_map");
  const filter: NotificationFilter = useTypedRedux("mentions", "filter");

  useEffect(() => {
    Fragment.set({ page: filter });
  }, [filter]);

  function renderExplanation() {
    return (
      <Paragraph
        ellipsis={{
          rows: 1,
          expandable: true,
          symbol: <strong>read more</strong>,
        }}
        style={{ color: COLORS.GRAY_D, flex: "0 0 auto" }}
      >
        {intl.formatMessage(
          {
            id: "notifications.page.intro",
            description:
              "The @ sign in front of a user name handle is used to notify someone else.",
            defaultMessage: `Find messages, news or when someone used "@your_name" to explicitly mention you as a collaborator in a <A1>Chatroom</A1>,
            in the context of <A2>teaching</A2>, or <A3>when editing files.</A3>
            For example, when editing text in a Jupyter notebook or whiteboard,
            type an @ symbol, then select the name of a collaborator,
            and they will receive an email telling them that you mentioned them.
            You can also "@mention" yourself for testing or to make it easy to find something later.`,
          },
          {
            A1: (c) => <A href="https://doc.cocalc.com/chat.html">{c}</A>,
            A2: (c) => (
              <A href="https://doc.cocalc.com/teaching-interactions.html#mention-collaborators-in-chat">
                {c}
              </A>
            ),
            A3: (c) => (
              <A href="https://doc.cocalc.com/markdown.html#mentions">{c}</A>
            ),
          },
        )}
      </Paragraph>
    );
  }

  function renderContent() {
    if (filter == null || account_id == null) {
      return <Loading theme="medium" />;
    }

    return (
      <Flex style={{ overflow: "hidden", flex: 1 }}>
        <NotificationNav
          filter={filter}
          on_click={redux.getActions("mentions").set_filter}
          style={{
            display: "flex",
            flexDirection: "column",
            width: "200px",
            overflowY: "auto",
            marginRight: "10px",
            borderInlineEnd: "none",
          }}
        />
        <NotificationList
          account_id={account_id}
          mentions={mentions}
          news={news}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflowY: "auto",
          }}
          user_map={user_map}
          filter={filter}
        />
      </Flex>
    );
  }

  return (
    <div
      className="smc-vfill"
      style={{
        padding: "15px 30px",
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        overflowY: "hidden",
      }}
    >
      <div className="smc-vfill" style={{ maxWidth: "1400px" }}>
        <Title level={2} style={{ textAlign: "center", flex: "0 0 auto" }}>
          <Empty description="" /> Messages, Mentions and News
        </Title>
        {renderExplanation()}
        {renderContent()}
      </div>
    </div>
  );
};
