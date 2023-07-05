/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Space } from "antd";
import { useState } from "react";

import { Col, Row, Well } from "@cocalc/frontend/antd-bootstrap";
import { Icon, SettingBox } from "@cocalc/frontend/components";
import { HelpEmailLink } from "@cocalc/frontend/customize";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";
import { DeletedProjectWarning } from "../warnings/deleted";
import { Project } from "./types";

interface Props {
  project: Project;
  actions: ProjectsActions;
  mode?: "project" | "flyout";
}

export function HideDeleteBox(props: Readonly<Props>) {
  const { project, actions, mode = "project" } = props;
  const isFlyout = mode === "flyout";

  const [show_delete_conf, set_show_delete_conf] = useState<boolean>(false);

  function toggle_delete_project(): void {
    actions.toggle_delete_project(project.get("project_id"));
    set_show_delete_conf(false);
  }

  function toggle_hide_project(): void {
    actions.toggle_hide_project(project.get("project_id"));
  }

  function user_has_applied_upgrades(account_id: string, project: Project) {
    const upgrades = project.getIn(["users", account_id]);
    return upgrades ? upgrades.some((val) => val > 0) : undefined;
  }

  function delete_message(): JSX.Element {
    if (project.get("deleted")) {
      return <DeletedProjectWarning />;
    } else {
      return (
        <span>
          Delete this project for everyone. You can undo this for a few days
          after which it becomes permanent and all data in this project is lost.
        </span>
      );
    }
  }

  function hide_message(): JSX.Element {
    if (!webapp_client.account_id) return <span>Must be signed in.</span>;
    const user = project.getIn(["users", webapp_client.account_id]);
    if (user == undefined) {
      return <span>Does not make sense for admin.</span>;
    }
    if (user.get("hide")) {
      return (
        <span>
          Unhide this project, so it shows up in your default project listing.
          Right now it only appears when hidden is checked.
        </span>
      );
    } else {
      return (
        <span>
          Hide this project, so it does not show up in your default project
          listing. This only impacts you, not your collaborators, and you can
          easily unhide it.
        </span>
      );
    }
  }

  function render_delete_undelete_button(is_deleted, is_expanded): JSX.Element {
    let disabled, onClick, text;
    if (is_deleted) {
      text = "Undelete Project";
      onClick = toggle_delete_project;
      disabled = false;
    } else {
      text = "Delete Project...";
      onClick = () => set_show_delete_conf(true);
      disabled = is_expanded;
    }

    return (
      <Button
        danger
        style={{ float: "right" }}
        onClick={onClick}
        disabled={disabled}
        cocalc-test={is_deleted ? "undelete-project" : "delete-project"}
      >
        <Icon name="trash" /> {text}
      </Button>
    );
  }

  function render_expanded_delete_info(): JSX.Element {
    const has_upgrades =
      webapp_client.account_id == null
        ? false
        : user_has_applied_upgrades(webapp_client.account_id, project);
    return (
      <Well style={{ textAlign: "center" }}>
        {has_upgrades ? (
          <Alert
            showIcon
            style={{ margin: "15px" }}
            type="info"
            description={
              <>
                All of your upgrades from this project will be removed
                automatically. Undeleting the project will not automatically
                restore them. This will not affect upgrades other people have
                applied.
              </>
            }
          />
        ) : undefined}
        {!has_upgrades ? (
          <div style={{ marginBottom: "5px" }}>
            Are you sure you want to delete this project?
          </div>
        ) : undefined}
        <Space>
          <Button onClick={() => set_show_delete_conf(false)}>Cancel</Button>
          <Button
            danger
            onClick={toggle_delete_project}
            cocalc-test="please-delete-project"
          >
            Yes, please delete this project
          </Button>
        </Space>
      </Well>
    );
  }

  function renderBody() {
    return (
      <>
        <Row>
          <Col sm={8}>{hide_message()}</Col>
          <Col sm={4}>
            <Button
              onClick={toggle_hide_project}
              style={{ float: "right" }}
              cocalc-test={hidden ? "unhide-project" : "hide-project"}
            >
              <Icon name="eye-slash" /> {hidden ? "Unhide" : "Hide"} Project
            </Button>
          </Col>
        </Row>
        <hr />
        <Row>
          <Col sm={8}>{delete_message()}</Col>
          <Col sm={4}>
            {render_delete_undelete_button(
              project.get("deleted"),
              show_delete_conf
            )}
          </Col>
        </Row>
        {show_delete_conf && !project.get("deleted") ? (
          <Row style={{ marginTop: "10px" }}>
            <Col sm={12}>{render_expanded_delete_info()}</Col>
          </Row>
        ) : undefined}
        <hr />
        <Row style={{ color: COLORS.GRAY_M }}>
          <Col sm={12}>
            If you do need to permanently delete some sensitive information that
            you accidentally copied into a project, contact <HelpEmailLink />.
          </Col>
        </Row>
      </>
    );
  }

  if (!webapp_client.account_id) return <span>Must be signed in.</span>;
  const user = project.getIn(["users", webapp_client.account_id]);
  if (user == undefined) {
    return <span>Does not make sense for admin.</span>;
  }
  const hidden = user.get("hide");
  if (isFlyout) {
    return renderBody();
  } else {
    return (
      <SettingBox title="Hide or delete project" icon="warning">
        {renderBody()}
      </SettingBox>
    );
  }
}
