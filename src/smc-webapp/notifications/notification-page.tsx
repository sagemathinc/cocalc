/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { NotificationNav } from "./notification-nav";
import { NotificationList } from "./notification-list";
import { MentionFilter } from "./mentions/types";

import { redux, rclass, rtypes } from "../app-framework";

import { Icon } from "../r_misc";

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
        <div style={outer_container_style} className="smc-vfill">
          <h3 style={{ color: "#666" }}>
            <Icon name="at" /> Mentions
          </h3>
          <div style={inner_container_style}>
            <NotificationNav
              filter={filter}
              on_click={redux.getActions("mentions").set_filter}
              style={nav_style}
            />
            <NotificationList
              account_id={account_id}
              mentions={mentions}
              style={list_style}
              user_map={user_map}
              filter={filter}
            />
          </div>
        </div>
      );
    }
  }
);

const outer_container_style: React.CSSProperties = {
  overflow: "scroll",
  paddingLeft: "8%",
  paddingRight: "8%",
  paddingTop: "20px",
};

const inner_container_style: React.CSSProperties = {
  display: "flex",
};

const nav_style: React.CSSProperties = {
  margin: "15px 15px 15px 0px",
};

const list_style: React.CSSProperties = {
  flex: "1",
  margin: "15px 0px 15px 15px",
};
