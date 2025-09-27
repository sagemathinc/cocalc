/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// The "Restart Project" button, which says "Start" like the one at the top if the project isn't running

import { PlayCircleOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, ButtonProps, Popconfirm } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { redux, useActions } from "@cocalc/frontend/app-framework";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { useProjectState } from "../page/project-state-hook";

interface Props {
  project_id: string;
  disabled?: boolean;
  text?: string;
  size?: ButtonProps["size"];
  danger?: boolean;
}

export function RestartProject({
  project_id,
  disabled,
  text,
  size,
  danger,
}: Props) {
  const actions = useActions("projects");
  const state = useProjectState(project_id);
  const intl = useIntl();
  const is_running = state.get("state") === "running";
  const task = intl.formatMessage(
    {
      id: "project.settings.restart-project.button.label",
      defaultMessage: "{is_running, select, true {Restart} other {Start}}",
    },
    { is_running },
  );
  const icon = is_running ? <SyncOutlined /> : <PlayCircleOutlined />;
  const description = text != null ? text : `${task}${is_running ? "…" : ""}`;

  const explanation = (
    <div style={{ maxWidth: "300px" }}>
      <FormattedMessage
        {...labels.project_settings_restart_project_confirm_explanation}
        values={{
          a: (ch) => (
            <a
              onClick={() => {
                redux.getProjectActions(project_id)?.showComputeServers();
              }}
            >
              {ch}
            </a>
          ),
        }}
      />
    </div>
  );

  if (!is_running) {
    return (
      <Button
        disabled={disabled || actions == null}
        size={size}
        danger={danger}
        onClick={() => actions?.restart_project(project_id)}
      >
        {icon} {description}
      </Button>
    );
  }

  return (
    <Popconfirm
      placement={"bottom"}
      arrow={{ pointAtCenter: true }}
      title={explanation}
      icon={icon}
      onConfirm={() => actions?.restart_project(project_id)}
      okText={
        <FormattedMessage
          {...labels.project_settings_restart_project_confirm_ok}
          values={{ task: task.toLocaleLowerCase() }}
        />
      }
      cancelText={<CancelText />}
    >
      <Button
        disabled={disabled || actions == null}
        size={size}
        danger={danger}
      >
        {icon} {description}
      </Button>
    </Popconfirm>
  );
}
