/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The "Stop Project" button

import { useActions } from "@cocalc/frontend/app-framework";
import { Button, Popconfirm } from "antd";
import { StopOutlined } from "@ant-design/icons";

interface Props {
  project_id: string;
  disabled?: boolean;
  size?;
}

export function StopProject({ project_id, disabled, size }: Props) {
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
      arrow={{ pointAtCenter: true }}
      title={text}
      icon={<StopOutlined />}
      onConfirm={() => actions.stop_project(project_id)}
      okText="Yes, stop project"
      cancelText="Cancel"
    >
      <Button disabled={disabled || actions == null} size={size}>
        <StopOutlined /> Stop Project...
      </Button>
    </Popconfirm>
  );
}
