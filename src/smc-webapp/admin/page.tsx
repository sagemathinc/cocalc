/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "../app-framework";

import { AccountCreationToken } from "./account-creation-token";
import { SiteSettings } from "./site-settings";
//import { SubscriptionManager } from "./subscription-manager";
import { SystemNotifications } from "./system-notifications";
import { UserSearch } from "./users/user-search";
import { SiteLicenses } from "../site-licenses/admin/component";

export function AdminPage(): Rendered {
  return (
    <div
      style={{
        overflowY: "scroll",
        overflowX: "hidden",
        padding: "30px 45px",
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
      <AccountCreationToken />
      <hr />
      <SystemNotifications />
    </div>
  );
}
