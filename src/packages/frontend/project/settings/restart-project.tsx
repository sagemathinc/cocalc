/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The "Restart Project" button, which says "Start" like the one at the top if the project isn't running

import { React, useActions } from "../../app-framework";
import { useProjectState } from "../page/project-state-hook";
import { Button, ButtonStyle, ButtonSize } from "../../antd-bootstrap";
import { Popconfirm } from "antd";
import { SyncOutlined, PlayCircleOutlined } from "@ant-design/icons";

interface Props {
  project_id: string;
  disabled?: boolean;
  text?: string;
  bsStyle?: ButtonStyle;
  bsSize?: ButtonSize;
}

export const RestartProject: React.FC<Props> = React.memo((props) => {
  const { project_id, disabled, text, bsStyle, bsSize } = props;
  const actions = useActions("projects");
  const state = useProjectState(project_id);
  const is_running = state.get("state") === "running";
  const task = is_running ? "Restart" : "Start";
  const icon = is_running ? <SyncOutlined /> : <PlayCircleOutlined />;
  const description = text != null ? text : `${task} Project…`;

  const explanation = (
    <div style={{ maxWidth: "300px" }}>
      Restarting the project server will terminate all processes, update the
      project code, and start the project running again. It takes a few seconds,
      and can fix some issues in case things are not working properly. You'll
      not lose any files, but you have to start your notebooks and worksheets
      again.
    </div>
  );

  return (
    <Popconfirm
      placement={"bottom"}
      arrowPointAtCenter={true}
      title={explanation}
      icon={icon}
      onConfirm={() => actions?.restart_project(project_id)}
      okText="Yes, restart project"
      cancelText="Cancel"
    >
      <Button
        disabled={disabled || actions == null}
        bsSize={bsSize}
        bsStyle={bsStyle ?? "warning"}
      >
        {icon} {description}
      </Button>
    </Popconfirm>
  );
});
