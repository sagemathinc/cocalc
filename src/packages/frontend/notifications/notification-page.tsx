/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";

import { CSS, rclass, redux, rtypes } from "@cocalc/frontend/app-framework";
import { A, VisibleMDLG } from "@cocalc/frontend/components";
import { MentionFilter } from "./mentions/types";
import { NotificationList } from "./notification-list";
import { NotificationNav } from "./notification-nav";

const OUTER_STYLE: CSS = {
  overflow: "scroll",
  margin: "0 auto",
  maxWidth: "800px",
  padding: "15px",
} as const;

const INNER_STYLE: CSS = {
  display: "flex",
} as const;

const NAV_STYLE: CSS = {
  margin: "15px 15px 15px 0px",
} as const;

const LIST_STYLE: CSS = {
  flex: "1",
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
          <h1 style={{ color: "#666", textAlign: "center" }}>Mentions</h1>
          <VisibleMDLG>
            <div
              style={{
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
          </VisibleMDLG>
          <div style={INNER_STYLE}>
            <NotificationNav
              filter={filter}
              on_click={redux.getActions("mentions").set_filter}
              style={NAV_STYLE}
            />
            <NotificationList
              account_id={account_id}
              mentions={mentions}
              style={LIST_STYLE}
              user_map={user_map}
              filter={filter}
            />
          </div>
        </div>
      );
    }
  }
);
