import { React, Component } from "../frame-editors/generic/react";

import { AccountCreationToken } from "./account-creation-token";
import { SiteSettings } from "./site-settings";
import { StripeAPIKeys } from "./stripe-api-keys";
import { StripeUser } from "./stripe-user";
import { SubscriptionManager } from "./subscription-manager";
import { SystemNotifications } from "./system-notifications";

export class AdminPage extends Component {
  render() {
    return (
      <div
        style={{
          overflowY: "scroll",
          overflowX: "hidden",
          margin: "30px"
        }}
      >
        <h3>Administrative server settings</h3>
        <hr/>
        <AccountCreationToken />
        <hr/>
        <SiteSettings />
        <hr/>
        <StripeAPIKeys />
        <hr/>
        <StripeUser />
        <hr/>
        <SubscriptionManager />
        <hr/>
        <SystemNotifications />
      </div>
    );
  }
}
