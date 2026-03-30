/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Collapse, CollapseProps, Space } from "antd";

import { useEffect, useState } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, Title } from "@cocalc/frontend/components";
import {
  ComputeServers,
  computeServersEnabled,
  cloudFilesystemsEnabled,
} from "@cocalc/frontend/compute";
import CloudFilesystems from "@cocalc/frontend/compute/cloud-filesystem/cloud-filesystems";
import { ServerLink } from "@cocalc/frontend/project/named-server-panel";
import { SagewsControl } from "@cocalc/frontend/project/settings/sagews-control";
import { NAMED_SERVER_NAMES } from "@cocalc/util/types/servers";
import { FLYOUT_PADDING } from "./consts";
import { getFlyoutServers, storeFlyoutState } from "./state";

export function ServersFlyout({ project_id, wrap }) {
  const [expandedPanels, setExpandedPanels] = useState<string[]>([]);

  useEffect(() => {
    const state = getFlyoutServers(project_id);
    setExpandedPanels(state);
  }, []);

  function setExpandedPanelsHandler(keys: string[]) {
    setExpandedPanels(keys);
    storeFlyoutState(project_id, "servers", {
      servers: keys,
    });
  }

  const servers = NAMED_SERVER_NAMES.map((name) => (
    <ServerLink
      key={name}
      name={name}
      project_id={project_id}
      mode={"flyout"}
    />
  )).filter((s) => s != null);

  const items: CollapseProps["items"] = [];

  if (computeServersEnabled()) {
    items.push({
      key: "compute-servers",
      label: (
        <>
          <Icon name="server" /> Compute Servers
        </>
      ),
      children: <ComputeServers project_id={project_id} mode="flyout" />,
    });
  }

  if (cloudFilesystemsEnabled()) {
    items.push({
      key: "cloud-filesystems",
      label: (
        <>
          <Icon name="disk-round" /> Cloud Filesystems
        </>
      ),
      children: <CloudFilesystems project_id={project_id} />,
    });
  }

  items.push({
    key: "notebooks",
    label: (
      <>
        <Icon name="jupyter" /> Notebook and Code Editing Servers
      </>
    ),
    children: (
      <div>
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
    ),
  });

  items.push({
    key: "sage",
    label: (
      <>
        <Icon name="sagemath" /> Sage Worksheet Server
      </>
    ),
    children: (
      <SagewsControl key="worksheet" project_id={project_id} mode="flyout" />
    ),
  });

  return wrap(
    <Space direction="vertical" style={{ padding: "0", width: "100%" }}>
      <div style={{ padding: FLYOUT_PADDING }}>
        <Title level={5}>
          <Icon name="server" /> Servers
        </Title>
      </div>
      <Collapse
        style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}
        activeKey={expandedPanels}
        onChange={(keys) => setExpandedPanelsHandler(keys as string[])}
        destroyOnHidden={true}
        items={items}
      />
    </Space>,
  );
}
