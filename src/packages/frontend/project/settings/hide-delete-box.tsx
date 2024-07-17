/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Popconfirm, Switch } from "antd";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  Icon,
  Paragraph,
  SettingBox,
  Title,
} from "@cocalc/frontend/components";
import { HelpEmailLink } from "@cocalc/frontend/customize";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";
import { useMemo } from "react";
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
  const is_deleted = useMemo(() => {
    return project.get("deleted");
  }, [project.get("deleted")]);

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

  function delete_message(): JSX.Element {
    if (is_deleted) {
      return <DeletedProjectWarning />;
    } else {
      return (
        <span>
          Delete this project for everyone. You can undo this for a few days
          after which it becomes permanent and all data in this project is lost.
          Any running compute servers stop shortly after the project is deleted,
          and the compute servers will be permanently deleted in a few days, if
          the project is not undeleted.
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

    return (
      <span>
        Hide this project, so it does not show up in your default project
        listing. This only impacts you, not your collaborators, and you can
        easily unhide it.
      </span>
    );
  }

  function render_delete_undelete_button(): JSX.Element {
    if (is_deleted) {
      return (
        <Button
          danger
          style={{ float: "right" }}
          onClick={toggle_delete_project}
          icon={<Icon name="trash" />}
        >
          Undelete Project
        </Button>
      );
    } else {
      return (
        <Popconfirm
          placement={"bottom"}
          arrow={{ pointAtCenter: true }}
          title={render_expanded_delete_info()}
          onConfirm={toggle_delete_project}
          okText={`Yes, please delete this project!`}
          cancelText="Cancel"
          overlayStyle={{ maxWidth: "400px" }}
          icon={<Icon name="trash" />}
        >
          <Button
            danger
            style={{ float: "right" }}
            icon={<Icon name="trash" />}
          >
            Delete Project...
          </Button>
        </Popconfirm>
      );
    }
  }

  function render_expanded_delete_info(): JSX.Element {
    const has_upgrades =
      webapp_client.account_id == null
        ? false
        : user_has_applied_upgrades(webapp_client.account_id, project);
    return (
      <Paragraph>
        <div style={{ marginBottom: "5px" }}>
          Are you sure you want to delete this project?
        </div>
        {has_upgrades ? (
          <Alert
            showIcon
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
      </Paragraph>
    );
  }

  function renderBody() {
    return (
      <>
        <Row>
          <Col sm={12}>
            <Title level={4}>
              <Icon name={hidden ? "eye-slash" : "eye"} /> Project{" "}
              {hidden ? "hidden" : "visible"}
              <Switch
                checked={hidden}
                style={{ float: "right" }}
                checkedChildren={"Hidden"}
                unCheckedChildren={"Visible"}
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
              <Icon name="trash" /> Delete project{" "}
              {render_delete_undelete_button()}
            </Title>
          </Col>
          <Col sm={12}>
            <Paragraph>{delete_message()}</Paragraph>
          </Col>
        </Row>
        <hr />
        <Row style={{ color: COLORS.GRAY_M }}>
          <Col sm={12}>
            Projects are not immediately deleted. If you need to permanently and
            immediately delete some sensitive information in this project,
            contact <HelpEmailLink />.
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
      <SettingBox title="Hide or Delete Project" icon="warning">
        {renderBody()}
      </SettingBox>
    );
  }
}
