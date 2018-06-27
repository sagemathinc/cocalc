import { React, Component } from "../frame-editors/generic/react";

import { AccountCreationToken } from "./account-creation-token";
import { SiteSettings } from "./site-settings";
import { StripeAPIKeys } from "./stripe-api-keys";
import { StripeUser } from "./stripe-user";
//import { SubscriptionManager } from "./subscription-manager";
import { SystemNotifications } from "./system-notifications";
import { UserSearch } from "./users/user-search";

export class AdminPage extends Component {
  render() {
    return (
      <div
        style={{
          overflowY: "scroll",
          overflowX: "hidden",
          margin: "0px 45px"
        }}
      >
        <h3>Administration</h3>
        <hr />
        <UserSearch />
        <hr/>
        <SiteSettings />
        <hr/>
        <SystemNotifications />
        <hr/>
        <StripeAPIKeys />
        <hr/>
        <StripeUser />
        <hr/>
        <AccountCreationToken />
      </div>
    );
  }
}
