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
      <div>
        <h3>Administrative server settings</h3>
        (not full implemented yet!)

        <AccountCreationToken />
        <SiteSettings />
        <StripeAPIKeys />
        <StripeUser />
        <SubscriptionManager />
        <SystemNotifications />
      </div>
    );
  }
}
