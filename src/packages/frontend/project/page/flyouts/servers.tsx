/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Space } from "antd";

import { Paragraph } from "@cocalc/frontend/components";
import { ServerLink } from "@cocalc/frontend/project/named-server-panel";

export function ServersFlyout({ project_id }) {
  const servers = [
    <ServerLink key="jupyterlab" name="jupyterlab" project_id={project_id} />,
    <ServerLink key="jupyter" name="jupyter" project_id={project_id} />,
    <ServerLink key="code" name="code" project_id={project_id} />,
    <ServerLink key="pluto" name="pluto" project_id={project_id} />,
  ].filter((s) => s != null);

  return (
    <div style={{ padding: "5px" }}>
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
