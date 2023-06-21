/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Space } from "antd";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName, Title } from "@cocalc/frontend/components";
import { RestartProject } from "@cocalc/frontend/project/settings/restart-project";
import { StopProject } from "@cocalc/frontend/project/settings/stop-project";
import { COMPUTE_STATES } from "@cocalc/util/compute-states";
import { useProjectState } from "../project-state-hook";

interface Props {
  project_id: string;
  wrap: Function;
}

export function SettingsFlyout(_: Readonly<Props>): JSX.Element {
  const { project_id, wrap } = _;

  const state = useProjectState(project_id);
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const projectIsVisible = active_top_tab === project_id;

  function renderState() {
    const s = state?.get("state");
    const iconName = COMPUTE_STATES[s]?.icon;
    const str = COMPUTE_STATES[s]?.display ?? s;

    const display = (
      <>
        <Icon name={iconName as IconName} /> {str}
      </>
    );

    switch (
      s as any // TODO: is "pending" a "ProjectStatus"?
    ) {
      case "running":
        return <span style={{ color: "green" }}>{display}</span>;
      case "starting":
        return <span style={{ color: "orange" }}>{display}</span>;
      case "pending":
        return <span style={{ color: "orange" }}>{display}</span>;
      case "stopping":
        return <span style={{ color: "orange" }}>{display}</span>;
      case "closed":
      case "archived":
      case "opened":
        return <span style={{ color: "red" }}>{display}</span>;
      default:
        return <span style={{ color: "red" }}>Unknown</span>;
    }
  }

  function renderStatus(): JSX.Element | undefined {
    if (!projectIsVisible) return;
    return (
      <>
        <Title level={4}>
          Status: <span style={{ float: "right" }}>{renderState()}</span>
        </Title>
        <Button.Group>
          <RestartProject project_id={project_id} short={true} />
          <StopProject
            project_id={project_id}
            disabled={state.get("state") !== "running"}
            short={true}
          />
        </Button.Group>
      </>
    );
  }

  return wrap(
    <Space direction="vertical" style={{ padding: "0 5px 0 5px" }}>
      {renderStatus()}
      <hr />
    </Space>
  );
}
