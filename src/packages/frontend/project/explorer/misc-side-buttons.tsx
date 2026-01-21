/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";
import { join } from "path";
import { defineMessage, useIntl } from "react-intl";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import { DropdownMenu, Icon, Tip, VisibleLG, type MenuItems } from "@cocalc/frontend/components";
import LinkRetry from "@cocalc/frontend/components/link-retry";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { labels } from "@cocalc/frontend/i18n";
import { serverURL, SPEC } from "@cocalc/frontend/project/named-server-panel";
import track from "@cocalc/frontend/user-tracking";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { type JSX, type MouseEvent } from "react";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import Snapshots from "@cocalc/frontend/project/snapshots";
import Backups from "@cocalc/frontend/project/backups";
import { BACKUPS, isBackupsPath } from "@cocalc/frontend/project/listing/use-backups";
import { lite } from "@cocalc/frontend/lite";
import TourButton from "./tour/button";
import CloneProject from "./clone";

const OPEN_MSG = defineMessage({
  id: "project.explorer.misc-side-buttons.open_dir.tooltip",
  defaultMessage: `Opens the current directory in a {name} server instance, running inside this project.`,
});

export function MiscSideButtons() {
  const { actions, project_id } = useProjectContext();
  const show_hidden = useTypedRedux({ project_id }, "show_hidden");
  const current_path = useTypedRedux({ project_id }, "current_path");
  const available_features = useTypedRedux(
    { project_id },
    "available_features",
  )?.toJS();
  const intl = useIntl();

  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const handle_hidden_toggle = (e: MouseEvent): void => {
    e.preventDefault();
    return actions?.setState({
      show_hidden: !show_hidden,
    });
  };

  const recoveryMenuItems: MenuItems = [
    {
      key: "snapshots-open",
      label: "Open Snapshots",
      onClick: () => {
        actions?.open_directory(SNAPSHOTS);
        track("snapshots", { action: "open", where: "explorer" });
      },
    },
    {
      key: "snapshots-create",
      label: "Create Snapshot",
      onClick: () => {
        actions?.open_directory(SNAPSHOTS);
        actions?.setState({ open_create_snapshot: true });
      },
    },
    {
      key: "snapshots-config",
      label: "Configure Snapshots",
      onClick: () => {
        actions?.open_directory(SNAPSHOTS);
        actions?.setState({ open_snapshot_schedule: true });
      },
    },
    { type: "divider" },
    {
      key: "backups-open",
      label: "Open Backups",
      onClick: () => {
        actions?.open_directory(BACKUPS);
        track("backups", { action: "open", where: "explorer" });
      },
    },
    {
      key: "backups-create",
      label: "Create Backup",
      onClick: () => {
        actions?.open_directory(BACKUPS);
        actions?.setState({ open_create_backup: true });
      },
    },
    {
      key: "backups-config",
      label: "Configure Backups",
      onClick: () => {
        actions?.open_directory(BACKUPS);
        actions?.setState({ open_backup_schedule: true });
      },
    },
  ];

  function render_hidden_toggle(): JSX.Element {
    const icon = show_hidden ? "eye" : "eye-slash";
    return (
      <Button bsSize="small" onClick={handle_hidden_toggle}>
        <Tip
          title={intl.formatMessage(labels.hidden_files, {
            hidden: show_hidden,
          })}
          placement={"bottom"}
        >
          <Icon name={icon} />
        </Tip>
      </Button>
    );
  }

  function render_recovery(): JSX.Element | undefined {
    return (
      <DropdownMenu
        button
        showDown
        items={recoveryMenuItems}
        title={
          <span style={{ whiteSpace: "nowrap" }}>
            <Icon name="life-ring" />{" "}
            <VisibleLG>
              <span style={{ fontSize: 12 }}>Recovery</span>
            </VisibleLG>
          </span>
        }
      />
    );
  }


  function render_vscode_button(): JSX.Element | undefined {
    if (student_project_functionality.disableVSCodeServer) {
      return;
    }
    if (!available_features) return;
    const { vscode, homeDirectory } = available_features;
    if (!vscode || !homeDirectory) return;
    const absPath = join(homeDirectory, current_path ?? "");
    // setting ?folder= tells VS Code to open that directory
    const url = `${serverURL(project_id, "code")}?folder=${absPath}`;
    const values = { name: SPEC.code.longName };
    const tooltip = intl.formatMessage(OPEN_MSG, values);
    const description = intl.formatMessage(SPEC.code.description, values);
    return (
      <LinkRetry href={url} mode="button">
        <Tip title={`${tooltip} ${description}`} placement="bottom">
          <Icon name={SPEC.code.icon} /> <VisibleLG>VS Code</VisibleLG>
        </Tip>
      </LinkRetry>
    );
  }

  function render_jupyterlab_button(): JSX.Element | undefined {
    if (student_project_functionality.disableJupyterLabServer) {
      return;
    }
    if (!available_features) return;
    if (!available_features.jupyter_lab) return;
    // appending /tree/[relative path to home dir]
    const base = serverURL(project_id, "jupyterlab");
    // we make sure the url ends with a slash, without messing up the full URL
    const s = base.slice(base.length - 1) === "/" ? "" : "/";
    const url = `${base}${s}${current_path ? "lab/tree/" + current_path : ""}`;
    const values = { name: SPEC.jupyterlab.longName };
    const tooltip = intl.formatMessage(OPEN_MSG, values);
    const description = intl.formatMessage(SPEC.jupyterlab.description, values);
    return (
      <LinkRetry href={url} mode="button">
        <Tip title={`${tooltip} ${description}`} placement="bottom">
          <Icon name={SPEC.jupyterlab.icon} /> <VisibleLG>JupyterLab</VisibleLG>
        </Tip>
      </LinkRetry>
    );
  }

  function render_upload_button(): JSX.Element | undefined {
    if (student_project_functionality.disableUploads) {
      return <span />;
    }
    return (
      <Button
        bsSize="small"
        className="upload-button"
        title={intl.formatMessage(labels.upload_tooltip)}
      >
        <Icon name="upload" />{" "}
        <VisibleLG>{intl.formatMessage(labels.upload)}</VisibleLG>
      </Button>
    );
  }

  return (
    <Space className="pull-right">
      {(current_path == SNAPSHOTS ||
        current_path.startsWith(SNAPSHOTS + "/")) && <Snapshots />}
      {current_path &&
        isBackupsPath(current_path) &&
        (current_path === BACKUPS || current_path.startsWith(`${BACKUPS}/`)) && (
          <Backups />
        )}
      <Space.Compact>
        {render_jupyterlab_button()}
        {render_vscode_button()}
      </Space.Compact>
      <Space.Compact>
        {render_upload_button()}
      </Space.Compact>
      <div className="pull-right">
        <Space.Compact>
          {render_hidden_toggle()}
          {!lite && render_recovery()}
          {!lite && <CloneProject project_id={project_id} />}
          {!lite && <TourButton project_id={project_id} />}
        </Space.Compact>
      </div>
    </Space>
  );
}
