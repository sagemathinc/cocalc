/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Project } from "./types";
import { Icon, SettingBox } from "smc-webapp/r_misc";
import { DeletedProjectWarning } from "../warnings/deleted";
import { Button, Well, Alert, ButtonToolbar, Row, Col } from "react-bootstrap";
import { ProjectsActions } from "smc-webapp/todo-types";
import { webapp_client } from "../../webapp-client";
import { HelpEmailLink } from "../../customize";

interface Props {
  project: Project;
  actions: ProjectsActions;
}

interface State {
  show_delete_conf: boolean;
}

export class HideDeleteBox extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { show_delete_conf: false };
  }

  show_delete_conf = (): void => {
    this.setState({ show_delete_conf: true });
  };

  hide_delete_conf = (): void => {
    return this.setState({ show_delete_conf: false });
  };

  toggle_delete_project = (): void => {
    this.props.actions.toggle_delete_project(
      this.props.project.get("project_id")
    );
    this.hide_delete_conf();
  };

  toggle_hide_project = (): void => {
    this.props.actions.toggle_hide_project(
      this.props.project.get("project_id")
    );
  };

  user_has_applied_upgrades(account_id: string, project: Project) {
    const upgrades = project.getIn(["users", account_id]);
    return upgrades ? upgrades.some((val) => val > 0) : undefined;
  }

  delete_message(): JSX.Element {
    if (this.props.project.get("deleted")) {
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

  hide_message(): JSX.Element {
    if (!webapp_client.account_id) return <span>Must be signed in.</span>;
    const user = this.props.project.getIn(["users", webapp_client.account_id]);
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

  render_delete_undelete_button(is_deleted, is_expanded): JSX.Element {
    let disabled, onClick, text;
    if (is_deleted) {
      text = "Undelete Project";
      onClick = this.toggle_delete_project;
      disabled = false;
    } else {
      text = "Delete Project...";
      onClick = this.show_delete_conf;
      disabled = is_expanded;
    }

    return (
      <Button
        bsStyle="danger"
        style={{ float: "right" }}
        onClick={onClick}
        disabled={disabled}
        cocalc-test={is_deleted ? "undelete-project" : "delete-project"}
      >
        <Icon name="trash" /> {text}
      </Button>
    );
  }

  render_expanded_delete_info(): JSX.Element {
    const has_upgrades =
      webapp_client.account_id == null
        ? false
        : this.user_has_applied_upgrades(
            webapp_client.account_id,
            this.props.project
          );
    return (
      <Well style={{ textAlign: "center" }}>
        {has_upgrades ? (
          <Alert bsStyle="info" style={{ padding: "8px" }}>
            All of your upgrades from this project will be removed
            automatically. Undeleting the project will not automatically restore
            them. This will not affect upgrades other people have applied.
          </Alert>
        ) : undefined}
        {!has_upgrades ? (
          <div style={{ marginBottom: "5px" }}>
            Are you sure you want to delete this project?
          </div>
        ) : undefined}
        <ButtonToolbar>
          <Button
            bsStyle="danger"
            onClick={this.toggle_delete_project}
            cocalc-test="please-delete-project"
          >
            Yes, please delete this project
          </Button>
          <Button onClick={this.hide_delete_conf}>Cancel</Button>
        </ButtonToolbar>
      </Well>
    );
  }

  render(): JSX.Element {
    if (!webapp_client.account_id) return <span>Must be signed in.</span>;
    const user = this.props.project.getIn(["users", webapp_client.account_id]);
    if (user == undefined) {
      return <span>Does not make sense for admin.</span>;
    }
    const hidden = user.get("hide");
    return (
      <SettingBox title="Hide or delete project" icon="warning">
        <Row>
          <Col sm={8}>{this.hide_message()}</Col>
          <Col sm={4}>
            <Button
              bsStyle="warning"
              onClick={this.toggle_hide_project}
              style={{ float: "right" }}
              cocalc-test={hidden ? "unhide-project" : "hide-project"}
            >
              <Icon name="eye-slash" /> {hidden ? "Unhide" : "Hide"} Project
            </Button>
          </Col>
        </Row>
        <hr />
        <Row>
          <Col sm={8}>{this.delete_message()}</Col>
          <Col sm={4}>
            {this.render_delete_undelete_button(
              this.props.project.get("deleted"),
              this.state.show_delete_conf
            )}
          </Col>
        </Row>
        {this.state.show_delete_conf && !this.props.project.get("deleted") ? (
          <Row style={{ marginTop: "10px" }}>
            <Col sm={12}>{this.render_expanded_delete_info()}</Col>
          </Row>
        ) : undefined}
        <hr />
        <Row style={{ color: "#666" }}>
          <Col sm={12}>
            If you do need to permanently delete some sensitive information that
            you accidentally copied into a project, contact <HelpEmailLink />.
          </Col>
        </Row>
      </SettingBox>
    );
  }
}
