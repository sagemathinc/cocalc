/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";
import { join } from "path";
import { defineMessage, useIntl } from "react-intl";
import { Button, ButtonToolbar } from "@cocalc/frontend/antd-bootstrap";
import { Icon, Tip, VisibleLG } from "@cocalc/frontend/components";
import LinkRetry from "@cocalc/frontend/components/link-retry";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { labels } from "@cocalc/frontend/i18n";
import { serverURL, SPEC } from "@cocalc/frontend/project/named-server-panel";
import track from "@cocalc/frontend/user-tracking";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { type JSX, type MouseEvent } from "react";

const SHOW_SERVER_LAUNCHERS = false;

import TourButton from "./tour/button";
import ForkProject from "./fork";

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
  const kucalc = useTypedRedux("customize", "kucalc");
  const intl = useIntl();

  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const handle_hidden_toggle = (e: MouseEvent): void => {
    e.preventDefault();
    return actions?.setState({
      show_hidden: !show_hidden,
    });
  };

  const handle_backup = (e: MouseEvent): void => {
    e.preventDefault();
    actions?.open_directory(".snapshots");
    track("snapshots", { action: "open", where: "explorer" });
  };

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

  function render_backup(): JSX.Element | undefined {
    // NOTE -- snapshots aren't available except in "kucalc" version
    // -- they are complicated nontrivial thing that isn't usually setup...
    if (kucalc !== KUCALC_COCALC_COM) {
      return;
    }
    return (
      <Button bsSize="small" onClick={handle_backup}>
        <Icon name="life-saver" />{" "}
        <VisibleLG>
          <span style={{ fontSize: 12 }}>Backups</span>
        </VisibleLG>
      </Button>
    );
  }

  const handle_library_click = (_e: MouseEvent): void => {
    track("library", { action: "open" });
    actions?.toggle_library();
  };

  function render_library_button(): JSX.Element | undefined {
    if (student_project_functionality.disableLibrary) {
      return;
    }
    // library only exists on kucalc, for now.
    if (!available_features?.library) return;
    if (kucalc !== "yes") return;
    return (
      <Button bsSize={"small"} onClick={handle_library_click}>
        <Icon name="book" /> <VisibleLG>Library</VisibleLG>
      </Button>
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
    const values = { name: SPEC.code.longName };
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
      return;
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
    <ButtonToolbar
      style={{ whiteSpace: "nowrap", padding: "0" }}
      className="pull-right"
    >
      {SHOW_SERVER_LAUNCHERS && (
        <Space.Compact>
          {render_jupyterlab_button()}
          {render_vscode_button()}
        </Space.Compact>
      )}
      <Space.Compact>
        {render_upload_button()}
        {render_library_button()}
      </Space.Compact>
      <div className="pull-right">
        <Space.Compact>
          {render_hidden_toggle()}
          {render_backup()}
          <ForkProject project_id={project_id} />
          <TourButton project_id={project_id} />
        </Space.Compact>
      </div>
    </ButtonToolbar>
  );
}
