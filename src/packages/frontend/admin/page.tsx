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
import { Icon } from "@cocalc/frontend/components";

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
        <Panel
          key="user-search"
          header=<>
            <Icon name="users" style={{ marginRight: "8px" }} /> User Search
          </>
        >
          <UserSearch />
        </Panel>
        <Panel
          key="site-licenses"
          header=<>
            <Icon name="key" style={{ marginRight: "8px" }} /> Licenses
          </>
        >
          <SiteLicenses />
        </Panel>
        <Panel
          key="site-settings"
          header=<>
            <Icon name="gears" style={{ marginRight: "8px" }} /> Site Settings
          </>
        >
          <SiteSettings
            close={() => {
              setActiveKey(activeKey.filter((key) => key != "site-settings"));
            }}
          />
        </Panel>
        <Panel
          key="registration-tokens"
          header=<>
            <Icon name="sign-in" style={{ marginRight: "8px" }} /> Registration
            Tokens
          </>
        >
          <RegistrationToken />
        </Panel>
        <Panel
          key="system-notifications"
          header=<>
            <Icon name="comment" style={{ marginRight: "8px" }} /> System
            Notifications
          </>
        >
          <SystemNotifications />
        </Panel>
        <Panel
          key="usage-stats"
          header=<>
            <Icon name="line-chart" style={{ marginRight: "8px" }} /> Usage
            Statistics
          </>
        >
          <UsageStatistics />
        </Panel>
      </Collapse>
    </div>
  );
}
