/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Space } from "antd";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Col, Row, Well } from "@cocalc/frontend/antd-bootstrap";
import { Icon, SettingBox } from "@cocalc/frontend/components";
import { HelpEmailLink } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
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

  const intl = useIntl();

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
          <FormattedMessage
            id="project.settings.hide-delete-box.delete.explanation"
            defaultMessage={`Delete this project for everyone.
            You can undo this for a few days after which it becomes permanent and all data in this project is lost.
            Any running compute servers stop shortly after the project is deleted,
            and the compute servers will be permanently deleted in a few days,
            if the project is not undeleted.`}
          />
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

    const msg = (
      <FormattedMessage
        id="project.settings.hide-delete-box.hide.explanation"
        defaultMessage={`
          {hide, select, true {
            Unhide this project, so it shows up in your default project listing.
            Right now it only appears when hidden is checked.
          }
          other {
            Hide this project, so it does not show up in your default project listing.
            This only impacts you, not your collaborators, and you can easily unhide it.
          }}`}
        values={{ hide: user.get("hide") }}
      />
    );

    return <span>{msg}</span>;
  }

  function render_delete_undelete_button(is_deleted, is_expanded): JSX.Element {
    let disabled, onClick;

    const text = intl.formatMessage(
      {
        id: "project.settings.hide-delete-box.delete.label",
        defaultMessage: `{is_deleted, select, true {Undelete Project} other {Delete Project...}} Project`,
      },
      { is_deleted },
    );

    if (is_deleted) {
      onClick = toggle_delete_project;
      disabled = false;
    } else {
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
            description={intl.formatMessage({
              id: "project.settings.hide-delete-box.delete.warning.info",
              defaultMessage: `All of your upgrades from this project will be removed automatically.
              Undeleting the project will not automatically restore them.
              This will not affect upgrades other people have applied.`,
            })}
          />
        ) : undefined}
        {!has_upgrades ? (
          <div style={{ marginBottom: "5px" }}>
            {intl.formatMessage({
              id: "project.settings.hide-delete-box.delete.warning.title",
              defaultMessage: "Are you sure you want to delete this project?",
            })}
          </div>
        ) : undefined}
        <Space>
          <Button onClick={() => set_show_delete_conf(false)}>
            {intl.formatMessage(labels.cancel)}
          </Button>
          <Button
            danger
            onClick={toggle_delete_project}
            cocalc-test="please-delete-project"
          >
            {intl.formatMessage({
              id: "project.settings.hide-delete-box.delete.warning.confirmation",
              defaultMessage: "Yes, please delete this project",
            })}
          </Button>
        </Space>
      </Well>
    );
  }

  function renderBody() {
    const hide_label = intl.formatMessage(
      {
        id: "project.settings.hide-delete-box.hide.label",
        defaultMessage: `{hidden, select, true {Unhide} other {Hide}} Project`,
      },
      { hidden },
    );

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
              <Icon name="eye-slash" /> {hide_label}
            </Button>
          </Col>
        </Row>
        <hr />
        <Row>
          <Col sm={8}>{delete_message()}</Col>
          <Col sm={4}>
            {render_delete_undelete_button(
              project.get("deleted"),
              show_delete_conf,
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
            <FormattedMessage
              id="project.settings.hide-delete-box.delete.disclaimer"
              defaultMessage={`Projects are not immediately deleted.
                If you need to permanently and immediately delete some sensitive information in this project,
                contact {help}.`}
              values={{ help: <HelpEmailLink /> }}
            />
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
      <SettingBox
        title={intl.formatMessage({
          id: "project.settings.hide-delete-box.title",
          defaultMessage: "Hide or Delete Project",
        })}
        icon="warning"
      >
        {renderBody()}
      </SettingBox>
    );
  }
}
