/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";
import { Collapse } from "antd";
import { RegistrationToken } from "./registration-token";
import SiteSettings from "./site-settings";
import { Title } from "@cocalc/frontend/components";
import { SiteLicenses } from "../site-licenses/admin/component";
import { UsageStatistics } from "./stats/page";
import { SystemNotifications } from "./system-notifications";
import { UserSearch } from "./users/user-search";

const { Panel } = Collapse;

export function AdminPage() {
  const [activeKey, setActiveKey] = useState<string[]>([]);
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
      <Collapse
        destroyInactivePanel /* so that data is refreshed when they are shown */
        activeKey={activeKey}
        onChange={(activeKey) => {
          setActiveKey(activeKey as string[]);
        }}
      >
        <Panel key="user-search" header="User Search">
          <UserSearch />
        </Panel>
        <Panel key="site-licenses" header="Site Licenses">
          <SiteLicenses />
        </Panel>
        <Panel key="site-settings" header="Site Settings">
          <SiteSettings
            close={() => {
              setActiveKey(activeKey.filter((key) => key != "site-settings"));
            }}
          />
        </Panel>
        <Panel key="registration-tokens" header="Registration Tokens">
          <RegistrationToken />
        </Panel>
        <Panel key="system-notifications" header="System Notifications">
          <SystemNotifications />
        </Panel>
        <Panel key="usage-stats" header="Usage Statistics">
          <UsageStatistics />
        </Panel>
      </Collapse>
    </div>
  );
}
