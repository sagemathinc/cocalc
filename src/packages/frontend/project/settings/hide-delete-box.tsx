/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Popconfirm, Switch } from "antd";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  Icon,
  Paragraph,
  SettingBox,
  Title,
} from "@cocalc/frontend/components";
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
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabelLower = intl.formatMessage(labels.projects).toLowerCase();
  const is_deleted = project.get("deleted");

  const deleteUndeleteMsg = (
    <FormattedMessage
      id="project.settings.hide-delete-box.delete.label"
      defaultMessage={`{is_deleted, select, true {Undelete {projectLabel}} other {Delete {projectLabel}}}`}
      values={{ is_deleted, projectLabel }}
    />
  );

  function toggle_delete_project(): void {
    actions.toggle_delete_project(project.get("project_id"));
  }

  function toggle_hide_project(): void {
    actions.toggle_hide_project(project.get("project_id"));
  }

  function user_has_applied_upgrades(account_id: string, project: Project) {
    const upgrades = project.getIn(["users", account_id]);
    return upgrades ? upgrades.some((val) => val > 0) : undefined;
  }

  function delete_message(): React.JSX.Element {
    if (is_deleted) {
      return <DeletedProjectWarning />;
    } else {
      return (
        <span>
          <FormattedMessage
            id="project.settings.hide-delete-box.delete.explanation"
            defaultMessage={`Delete this {projectLabel} for everyone.
            You can undo this for a few days after which it becomes permanent and all data in this {projectLabel} is lost.
            Any running compute servers stop shortly after the {projectLabel} is deleted,
            and the compute servers will be permanently deleted in a few days,
            if the {projectLabel} is not undeleted.`}
            values={{ projectLabel: projectLabelLower }}
          />
        </span>
      );
    }
  }

  function hide_message(): React.JSX.Element {
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
            Unhide this {projectLabel}, so it shows up in your default {projectLabel} listing.
            Right now it only appears when hidden is checked.
          }
          other {
            Hide this {projectLabel}, so it does not show up in your default {projectLabel} listing.
            This only impacts you, not your collaborators, and you can easily unhide it.
          }}`}
        values={{ hide: hidden, projectLabel: projectLabelLower }}
      />
    );

    return <span>{msg}</span>;
  }

  function render_delete_undelete_button(): React.JSX.Element {
    if (is_deleted) {
      return (
        <Button
          danger
          style={{ float: "right" }}
          onClick={toggle_delete_project}
          icon={<Icon name="trash" />}
        >
          {deleteUndeleteMsg}
        </Button>
      );
    } else {
      return (
        <Popconfirm
          placement={"bottom"}
          arrow={{ pointAtCenter: true }}
          title={render_expanded_delete_info()}
          onConfirm={toggle_delete_project}
          okText={intl.formatMessage(
            {
              id: "project.settings.hide-delete-box.delete.confirm.yes",
              defaultMessage: `Yes, please delete this {projectLabel}!`,
            },
            { projectLabel: projectLabelLower },
          )}
          cancelText={intl.formatMessage(labels.cancel)}
          overlayStyle={{ maxWidth: "400px" }}
          icon={<Icon name="trash" />}
        >
          <Button
            danger
            style={{ float: "right" }}
            icon={<Icon name="trash" />}
          >
            {deleteUndeleteMsg}...
          </Button>
        </Popconfirm>
      );
    }
  }

  function render_expanded_delete_info(): React.JSX.Element {
    const has_upgrades =
      webapp_client.account_id == null
        ? false
        : user_has_applied_upgrades(webapp_client.account_id, project);
    return (
      <Paragraph>
        <div style={{ marginBottom: "5px" }}>
          {intl.formatMessage(
            {
              id: "project.settings.hide-delete-box.delete.warning.title",
              defaultMessage: `Are you sure you want to delete this {projectLabel}?`,
            },
            { projectLabel: projectLabelLower },
          )}
        </div>
        {has_upgrades ? (
          <Alert
            showIcon
            style={{ margin: "15px" }}
            type="info"
            description={intl.formatMessage(
              {
                id: "project.settings.hide-delete-box.delete.warning.info",
                defaultMessage: `All of your upgrades from this {projectLabel} will be removed automatically.
              Undeleting the {projectLabel} will not automatically restore them.
              This will not affect upgrades other people have applied.`,
              },
              { projectLabel: projectLabelLower },
            )}
          />
        ) : undefined}
      </Paragraph>
    );
  }

  function renderBody() {
    const hide_label = intl.formatMessage(
      {
        id: "project.settings.hide-delete-box.hide.label",
        defaultMessage: `{hidden, select, true {Unhide {projectLabel}} other {Hide {projectLabel}}}`,
      },
      { hidden, projectLabel },
    );

    const hide_switch = defineMessage({
      id: "project.settings.hide-delete-box.hide.switch",
      defaultMessage: `{hidden, select, true {Hidden} other {Visible}}`,
      description: "The project is either visible or hidden",
    });

    return (
      <>
        <Row style={{ color: COLORS.GRAY_M }}>
          <Col sm={12}>
            <Title level={4}>
              <Icon name={hidden ? "eye-slash" : "eye"} /> {hide_label}
              <Switch
                checked={hidden}
                style={{ float: "right" }}
                checkedChildren={intl.formatMessage(hide_switch, {
                  hidden: true,
                })}
                unCheckedChildren={intl.formatMessage(hide_switch, {
                  hidden: false,
                })}
                onChange={toggle_hide_project}
              />
            </Title>
            <Paragraph>{hide_message()}</Paragraph>
          </Col>
        </Row>
        <hr />
        <Row>
          <Col sm={12}>
            <Title level={4}>
              <Icon name="trash" /> {deleteUndeleteMsg}{" "}
              {render_delete_undelete_button()}
            </Title>
          </Col>
          <Col sm={12}>
            <Paragraph>{delete_message()}</Paragraph>
            <Paragraph type="secondary">
              <FormattedMessage
                id="project.settings.hide-delete-box.delete.disclaimer"
                defaultMessage={`{projectsLabel} are not immediately deleted.
                If you need to permanently and immediately delete some sensitive information in this {projectLabel},
                contact {help}.`}
                values={{
                  help: <HelpEmailLink />,
                  projectsLabel: projectsLabelLower,
                  projectLabel: projectLabelLower,
                }}
              />
            </Paragraph>
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
        title={intl.formatMessage(
          {
            id: "project.settings.hide-delete-box.title",
            defaultMessage: "Hide or Delete {projectLabel}",
          },
          { projectLabel },
        )}
        icon="warning"
      >
        {renderBody()}
      </SettingBox>
    );
  }
}
