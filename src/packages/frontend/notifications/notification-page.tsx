/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";
import React from "react";

import { CSS, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  A,
  Icon,
  Loading,
  Paragraph,
  Title,
} from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { NotificationFilter } from "./mentions/types";
import { NotificationList } from "./notification-list";
import { NotificationNav } from "./notification-nav";

const OUTER_STYLE: CSS = {
  display: "flex",
  flex: "1",
  flexDirection: "column",
  height: "100%",
  margin: "0",
  overflowY: "hidden",
  overflowX: "auto",
} as const;

const INNER_STYLE: CSS = {
  display: "flex",
  height: "100%",
  flex: "1",
  flexDirection: "column",
  margin: "0px auto",
  padding: "0 10px",
  maxWidth: "1200px",
  overflow: "hidden",
} as const;

const CONTENT_STYLE: CSS = {
  display: "flex",
  flex: "1 1 0",
  flexDirection: "row",
  height: "100%",
  overflow: "hidden",
};

const NAV_COL_STYLE: CSS = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  flex: "1 1 0",
  overflow: "auto",
};

const NAV_STYLE: CSS = {
  width: "200px",
  margin: "0",
  borderInlineEnd: "none",
} as const;

const LIST_CONTAINER_STYLE: CSS = {
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflowX: "hidden",
  overflowY: "auto",
} as const;

const LIST_STYLE: CSS = {
  flex: "1 1 0",
  height: "100%",
  overflow: "auto",
  margin: "0",
} as const;

export const NotificationPage: React.FC<{}> = () => {
  const account_id = useTypedRedux("account", "account_id");
  const mentions = useTypedRedux("mentions", "mentions");
  const news = useTypedRedux("news", "news");
  const user_map = useTypedRedux("users", "user_map");
  const filter: NotificationFilter = useTypedRedux("mentions", "filter");

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
        Global news or someone used @your_name to explicitly mention you as a
        collaborator. This could have happened in a{" "}
        <A href="https://doc.cocalc.com/chat.html">Chatroom</A>, in the context
        of{" "}
        <A href="https://doc.cocalc.com/teaching-interactions.html#mention-collaborators-in-chat">
          teaching
        </A>
        , or{" "}
        <A href="https://doc.cocalc.com/markdown.html#mentions">
          when editing files.
        </A>{" "}
        For example, when editing text in a Jupyter notebook or whiteboard, type
        an @ symbol, then select the name of a collaborator, and they will
        receive an email telling them that you mentioned them. You can also
        @mention yourself for testing or to make it easy to find something
        later.
      </Paragraph>
    );
  }

  function renderContent() {
    if (filter == null || account_id == null) {
      return <Loading theme="medium" />;
    }

    return (
      <Row style={CONTENT_STYLE} gutter={[20, 20]}>
        <Col span={6} style={NAV_COL_STYLE}>
          <NotificationNav
            filter={filter}
            on_click={redux.getActions("mentions").set_filter}
            style={NAV_STYLE}
          />
        </Col>

        <Col span={18} style={LIST_CONTAINER_STYLE}>
          <NotificationList
            account_id={account_id}
            mentions={mentions}
            news={news}
            style={LIST_STYLE}
            user_map={user_map}
            filter={filter}
          />
        </Col>
      </Row>
    );
  }

  return (
    <div style={OUTER_STYLE}>
      <div style={INNER_STYLE}>
        <Title level={2} style={{ textAlign: "center", flex: "0 0 auto" }}>
          <Icon name="mail" /> Notifications
        </Title>
        {renderExplanation()}
        {renderContent()}
      </div>
    </div>
  );
};
