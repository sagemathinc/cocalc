/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The "Stop Project" button

import { React, useActions } from "../../app-framework";
import { Button } from "../../antd-bootstrap";
import { Popconfirm } from "antd";
import { StopOutlined } from "@ant-design/icons";

interface Props {
  project_id: string;
  disabled?: boolean;
}

export const StopProject: React.FC<Props> = React.memo((props) => {
  const { project_id, disabled } = props;
  const actions = useActions("projects");

  const text = (
    <div style={{ maxWidth: "300px" }}>
      Stopping the project server will kill all processes. After stopping a
      project, it will not start until you or a collaborator restarts the
      project.
    </div>
  );

  return (
    <Popconfirm
      placement={"bottom"}
      arrowPointAtCenter={true}
      title={text}
      icon={<StopOutlined />}
      onConfirm={() => actions.stop_project(project_id)}
      okText="Yes, stop project"
      cancelText="Cancel"
    >
      <Button bsStyle="warning" disabled={disabled || actions == null}>
        <StopOutlined /> Stop Project...
      </Button>
    </Popconfirm>
  );
});
