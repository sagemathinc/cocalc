/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";

import { CSS, rclass, redux, rtypes } from "@cocalc/frontend/app-framework";
import { A, Title } from "@cocalc/frontend/components";
import { MentionFilter } from "./mentions/types";
import { NotificationList } from "./notification-list";
import { NotificationNav } from "./notification-nav";

const OUTER_STYLE: CSS = {
  overflow: "none",
} as const;

const INNER_STYLE: CSS = {
  display: "flex",
  height: "100%",
  overflow: "none",
  padding: "0 10px",
  margin: "0 auto",
  maxWidth: "800px",
  flexDirection: "column",
  flex: "1 0 auto",
} as const;

const CONTENT_STYLE: CSS = {
  height: "100%",
  display: "flex",
  flex: "1 0 auto",
  overflow: "none",
  outline: "1px solid red",
};

const NAV_STYLE: CSS = {
  margin: "15px 15px 15px 0px",
} as const;

const LIST_STYLE: CSS = {
  margin: "15px 0px 15px 15px",
} as const;

interface ReduxProps {
  account_id?: string;
  mentions?: any;
  user_map?: any;
  filter?: MentionFilter;
}

export const NotificationPage = rclass(
  class NotificationPage extends React.Component<ReduxProps> {
    public static reduxProps() {
      return {
        account: {
          account_id: rtypes.string,
        },
        mentions: {
          mentions: rtypes.immutable.Map,
          filter: rtypes.string,
        },
        users: {
          user_map: rtypes.immutable.Map,
        },
      };
    }

    render() {
      const { account_id, mentions, user_map, filter } = this.props;
      if (filter == null || account_id == null) {
        return <div />;
      }
      return (
        <div style={OUTER_STYLE} className="smc-vfill">
          <div style={INNER_STYLE}>
            <Title
              level={2}
              style={{
                display: "block",
                textAlign: "center",
                flex: "0 0 auto",
              }}
            >
              Mentions
            </Title>
            <div
              style={{
                flex: "0 0 auto",
                maxWidth: "800px",
                margin: "0 auto",
                color: "#666",
                border: "1px solid #ddd",
                padding: "15px",
                borderRadius: "5px",
                fontSize: "11pt",
              }}
            >
              Use @mention to explicitly mention your collaborators{" "}
              <A href="https://doc.cocalc.com/chat.html">in</A>{" "}
              <A href="https://doc.cocalc.com/teaching-interactions.html#mention-collaborators-in-chat">
                chatrooms
              </A>
              , and{" "}
              <A href="https://doc.cocalc.com/markdown.html#mentions">
                when editing files.
              </A>{" "}
              For example, when editing text in a Jupyter notebook or
              whiteboard, type an @ symbol, then select the name of a
              collaborator, and they will receive an email telling them that you
              mentioned them. You can also @mention yourself for testing or to
              make it easy to find something later.
            </div>
            <div style={CONTENT_STYLE}>
              <NotificationNav
                filter={filter}
                on_click={redux.getActions("mentions").set_filter}
                style={NAV_STYLE}
              />
              <div
                style={{
                  flex: "1 0 auto",
                  flexDirection: "column",
                  height: "100%",
                  overflow: "auto",
                }}
              >
                <NotificationList
                  account_id={account_id}
                  mentions={mentions}
                  style={LIST_STYLE}
                  user_map={user_map}
                  filter={filter}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }
  }
);
