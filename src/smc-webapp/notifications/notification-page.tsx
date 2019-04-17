import * as React from "react";
import { NotificationNav } from "./notification-nav";
import { NotificationList } from "./notification-list";

import { rclass, rtypes } from "../app-framework";

interface ReduxProps {
  account_id: string;
  mentions: any;
  user_map: any;
}

export const NotificationPage = rclass<ReduxProps>(
  class NotificationPage extends React.Component<ReduxProps> {
    public static reduxProps() {
      return {
        account: {
          account_id: rtypes.string
        },
        mentions: {
          mentions: rtypes.immutable.Map
        },
        users: {
          user_map: rtypes.immutable.Map
        }
      };
    }

    render() {
      const { account_id, mentions, user_map } = this.props;
      return (
        <div className={'container'} style={container_style}>
          <NotificationNav style={nav_style} />
          <NotificationList
            account_id={account_id}
            mentions={mentions}
            style={list_style}
            user_map={user_map}
          />
        </div>
      );
    }
  }
);

const container_style: React.CSSProperties = {
  display: "flex",
  overflow: "scroll"
};

const nav_style: React.CSSProperties = {
  margin: "15px 15px 15px 0px"
};

const list_style: React.CSSProperties = {
  flex: "1",
  margin: "15px 0px 15px 15px"
};
