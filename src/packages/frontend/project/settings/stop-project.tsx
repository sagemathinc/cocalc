/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// The "Stop Project" button

import { StopOutlined } from "@ant-design/icons";
import { Button, Popconfirm } from "antd";
import { FormattedMessage } from "react-intl";

import { useActions } from "@cocalc/frontend/app-framework";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";

interface Props {
  project_id: string;
  disabled?: boolean;
  size?;
  force?: boolean;
}

export function StopProject({ project_id, disabled, size, force }: Props) {
  const actions = useActions("projects");

  const text = (
    <div style={{ maxWidth: "300px" }}>
      {force ? (
        <>
          Forcing the project to stop will shut it down even if it is stuck
          trying to save some files. <b>This is potentially dangerous.</b>
        </>
      ) : (
        <FormattedMessage
          id="project.settings.stop-project.explanation"
          defaultMessage={
            "Stopping the project server will kill all processes. After stopping a project, it will not start until you or a collaborator restarts the project."
          }
        />
      )}
    </div>
  );

  return (
    <Popconfirm
      placement={"bottom"}
      arrow={{ pointAtCenter: true }}
      title={text}
      icon={<StopOutlined />}
      onConfirm={() => actions.stop_project(project_id, force)}
      okText={<FormattedMessage {...labels.project_settings_stop_project_ok} />}
      cancelText={<CancelText />}
    >
      <Button disabled={disabled || actions == null} size={size} danger={force}>
        <StopOutlined /> {force && "Force "}
        <FormattedMessage {...labels.project_settings_stop_project_label} />
      </Button>
    </Popconfirm>
  );
}
