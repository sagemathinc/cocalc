/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "@cocalc/frontend/app-framework";
import { Divider } from "antd";

import { RegistrationToken } from "./registration-token";
import SiteSettings from "./site-settings";
import { Title } from "@cocalc/frontend/components";
import { SiteLicenses } from "../site-licenses/admin/component";
import { UsageStatistics } from "./stats/page";
import { SystemNotifications } from "./system-notifications";
import { UserSearch } from "./users/user-search";

export const AdminPage: React.FC = React.memo(() => {
  return (
    <div
      className="smc-vfill"
      style={{
        overflowY: "auto",
        overflowX: "hidden",
        padding: "30px 45px",
      }}
    >
      <Title level={3}>Administration</Title>
      <UserSearch />
      <Divider />
      <SiteLicenses />
      <Divider />
      <SiteSettings />
      <Divider />
      <RegistrationToken />
      <Divider />
      <SystemNotifications />
      <Divider />
      <UsageStatistics />
    </div>
  );
});
