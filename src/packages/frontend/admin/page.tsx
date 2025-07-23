/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Collapse, CollapseProps } from "antd";
import { useState } from "react";

import { Icon, Title } from "@cocalc/frontend/components";
import { SiteLicenses } from "../site-licenses/admin/component";
import { RegistrationToken } from "./registration-token";
import SiteSettings from "./site-settings";
import { UsageStatistics } from "./stats/page";
import { SystemNotifications } from "./system-notifications";
import { UserSearch } from "./users/user-search";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { TestLLMAdmin } from "./llm/admin-llm-test";

const headerStyle = { fontSize: "12pt" } as const;

export function AdminPage() {
  const [activeKey, setActiveKey] = useState<string[]>([]);

  const items: CollapseProps["items"] = [
    {
      key: "user-search",
      label: (
        <div style={headerStyle}>
          <Icon name="users" style={{ marginRight: "8px" }} /> User Search
        </div>
      ),
      children: <UserSearch />,
    },
    {
      key: "site-licenses",
      label: (
        <div style={headerStyle}>
          <Icon name="key" style={{ marginRight: "8px" }} /> Licenses
        </div>
      ),
      children: <SiteLicenses />,
    },
    {
      key: "site-settings",
      label: (
        <div style={headerStyle}>
          <Icon name="gears" style={{ marginRight: "8px" }} /> Site Settings
        </div>
      ),
      children: (
        <SiteSettings
          close={() => {
            setActiveKey(activeKey.filter((key) => key != "site-settings"));
          }}
        />
      ),
    },
    {
      key: "registration-tokens",
      label: (
        <div style={headerStyle}>
          <Icon name="sign-in" style={{ marginRight: "8px" }} /> Registration
          Tokens
        </div>
      ),
      children: <RegistrationToken />,
    },
    {
      key: "system-notifications",
      label: (
        <div style={headerStyle}>
          <Icon name="comment" style={{ marginRight: "8px" }} /> System
          Notifications
        </div>
      ),
      children: <SystemNotifications />,
    },
    {
      key: "usage-stats",
      label: (
        <div style={headerStyle}>
          <Icon name="line-chart" style={{ marginRight: "8px" }} /> Usage
          Statistics
        </div>
      ),
      children: <UsageStatistics />,
    },
    {
      key: "llm-testing",
      label: (
        <div style={headerStyle}>
          <AIAvatar size={16} style={{ marginRight: "8px" }} /> Test LLM
          Integration
        </div>
      ),
      children: <TestLLMAdmin />,
    },
  ];

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
        destroyOnHidden /* so that data is refreshed when they are shown */
        activeKey={activeKey}
        onChange={(activeKey) => {
          setActiveKey(activeKey as string[]);
        }}
        items={items}
      />
    </div>
  );
}
