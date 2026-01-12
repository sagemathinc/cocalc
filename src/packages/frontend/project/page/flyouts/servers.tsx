/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider, Space, Tabs, TabsProps } from "antd";

import { Icon, Paragraph, Title } from "@cocalc/frontend/components";
import {
  ComputeServers,
  computeServersEnabled,
  cloudFilesystemsEnabled,
} from "@cocalc/frontend/compute";
import CloudFilesystems from "@cocalc/frontend/compute/cloud-filesystem/cloud-filesystems";
import { ServerLink } from "@cocalc/frontend/project/named-server-panel";
import { NAMED_SERVER_NAMES } from "@cocalc/util/types/servers";
import { FLYOUT_PADDING } from "./consts";
import {
  getServerTab,
  setServerTab,
  TabName,
} from "@cocalc/frontend/compute/tab";

export function ServersFlyout({ project_id, wrap }) {
  const servers = NAMED_SERVER_NAMES.map((name) => (
    <ServerLink
      key={name}
      name={name}
      project_id={project_id}
      mode={"flyout"}
    />
  )).filter((s) => s != null);

  function renderEmbeddedServers() {
    return (
      <div style={{ padding: FLYOUT_PADDING }}>
        <Title level={5}>
          <Icon name="server" /> Notebook and Code Editing Servers
        </Title>
        <Paragraph>
          When launched, these servers run inside this project. They should open
          up in a new browser tab, and get access all files in this project.
        </Paragraph>
        <Space direction="vertical">
          {servers}
          {servers.length === 0 && (
            <Paragraph>
              No available server has been detected in this project environment.
            </Paragraph>
          )}
        </Space>
      </div>
    );
  }


  function renderComputeServers() {
    return (
      <>
        <div style={{ padding: FLYOUT_PADDING }}>
          <Title level={5}>Compute Servers</Title>
          <ComputeServers project_id={project_id} />
        </div>
        <Divider />
      </>
    );
  }

  const items: TabsProps["items"] = [];
  if (computeServersEnabled()) {
    items.push({
      key: "compute-servers",
      label: (
        <>
          <Icon name="server" /> Compute
        </>
      ),
      children: renderComputeServers(),
    });
  }
  if (cloudFilesystemsEnabled()) {
    items.push({
      key: "cloud-filesystems",
      label: (
        <>
          <Icon name="disk-round" /> Filesystems
        </>
      ),
      children: <CloudFilesystems project_id={project_id} />,
    });
  }
  items.push({
    key: "notebooks",
    label: (
      <>
        <Icon name="jupyter" /> Notebooks
      </>
    ),
    children: (
      <>
        {renderEmbeddedServers()}
      </>
    ),
  });

  return wrap(
    <Tabs
      items={items}
      defaultActiveKey={getServerTab(project_id)}
      onChange={(tab) => setServerTab(project_id, tab as TabName)}
    />,
  );
}
