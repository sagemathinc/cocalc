import { React, Rendered } from "../app-framework";

import { AccountCreationToken } from "./account-creation-token";
import { SiteSettings } from "./site-settings";
import { StripeAPIKeys } from "./stripe-api-keys";
//import { SubscriptionManager } from "./subscription-manager";
import { SystemNotifications } from "./system-notifications";
import { AnnouncementEditor } from "./announcements";
import { UserSearch } from "./users/user-search";
import { SiteLicenses } from "../site-licenses/admin/component";

export function AdminPage(): Rendered {
  return (
    <div
      style={{
        overflowY: "scroll",
        overflowX: "hidden",
        padding: "30px 45px"
      }}
    >
      <h3>Administration</h3>
      <hr />
      <UserSearch />
      <hr />
      <SiteLicenses />
      <hr />
      <SiteSettings />
      <hr />
      <StripeAPIKeys />
      <hr />
      <AccountCreationToken />
      <hr />
      <AnnouncementEditor />
      <hr />
      <SystemNotifications />
    </div>
  );
}
