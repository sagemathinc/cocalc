import * as React from "react";
import { NotificationNav } from "./notification-nav";
import { NotificationList } from "./notification-list";
import { MentionFilter } from "./mentions/types";

import { redux, rclass, rtypes } from "../app-framework";

const { Tab, Tabs } = require("react-bootstrap");
import { Icon } from "../r_misc";

interface ReduxProps {
  account_id: string;
  mentions: any;
  user_map: any;
  filter: MentionFilter;
}

export const NotificationPage = rclass<ReduxProps>(
  class NotificationPage extends React.Component<ReduxProps> {
    public static reduxProps() {
      return {
        account: {
          account_id: rtypes.string
        },
        mentions: {
          mentions: rtypes.immutable.Map,
          filter: rtypes.string
        },
        users: {
          user_map: rtypes.immutable.Map
        }
      };
    }

    render() {
      const { account_id, mentions, user_map, filter } = this.props;
      return (
        <div style={outer_container_style}>
          <div className={"constrained container"}>
            <Tabs
              animation={false}
              style={{ paddingTop: "1em" }}
              id="notification-page-tabs"
            >
              <Tab
                eventKey="mentions"
                title={
                  <span>
                    <Icon name="at" /> Mentions
                  </span>
                }
              >
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
              </Tab>
            </Tabs>
          </div>
        </div>
      );
    }
  }
);

const outer_container_style: React.CSSProperties = {
  overflow: "scroll"
};

const inner_container_style: React.CSSProperties = {
  display: "flex"
};

const nav_style: React.CSSProperties = {
  margin: "15px 15px 15px 0px"
};

const list_style: React.CSSProperties = {
  flex: "1",
  margin: "15px 0px 15px 15px"
};
