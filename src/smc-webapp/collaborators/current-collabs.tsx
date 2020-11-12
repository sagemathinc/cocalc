/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { redux, rtypes, rclass } from "../app-framework";
import { Well, Button, ButtonToolbar, Row, Col } from "react-bootstrap";
import { Space, Icon, SettingBox } from "../r_misc";
import { Project } from "smc-webapp/project/settings/types";
const { User } = require("../users");

interface ReactProps {
  project: Project;
  user_map?: any;
}

interface ReduxProps {
  get_account_id: any;
  sort_by_activity: any;
  actions: any;
}

interface CurrentCollaboratorsPanelState {
  removing?: string; // id of account that we are currently confirming to remove
}

export const CurrentCollaboratorsPanel = rclass<ReactProps>(
  class CurrentCollaboratorsPanel extends React.Component<
    ReactProps & ReduxProps,
    CurrentCollaboratorsPanelState
  > {
    static reduxProps() {
      return {
        account: {
          get_account_id: rtypes.func,
        },
        projects: {
          sort_by_activity: rtypes.func,
        },
      };
    }
    constructor(props) {
      super(props);
      this.state = { removing: undefined };
    }
    remove_collaborator = (account_id: string) => {
      const project_id = this.props.project.get("project_id");
      redux.getActions("projects").remove_collaborator(project_id, account_id);
      this.setState({ removing: undefined });
      if (account_id === this.props.get_account_id()) {
        return (redux.getActions("page") as any).close_project_tab(project_id); // TODO: better types
      }
    };

    render_user_remove_confirm(account_id: string) {
      if (account_id === this.props.get_account_id()) {
        return (
          <Well style={{ background: "white" }}>
            Are you sure you want to remove <b>yourself</b> from this project?
            You will no longer have access to this project and cannot add
            yourself back.
            <ButtonToolbar style={{ marginTop: "15px" }}>
              <Button
                bsStyle="danger"
                onClick={() => this.remove_collaborator(account_id)}
              >
                Remove Myself
              </Button>
              <Button
                bsStyle="default"
                onClick={() => this.setState({ removing: "" })}
              >
                Cancel
              </Button>
            </ButtonToolbar>
          </Well>
        );
      } else {
        return (
          <Well style={{ background: "white" }}>
            Are you sure you want to remove{" "}
            <User account_id={account_id} user_map={this.props.user_map} /> from
            this project? They will no longer have access to this project.
            <ButtonToolbar style={{ marginTop: "15px" }}>
              <Button
                bsStyle="danger"
                onClick={() => this.remove_collaborator(account_id)}
              >
                Remove
              </Button>
              <Button
                bsStyle="default"
                onClick={() => this.setState({ removing: "" })}
              >
                Cancel
              </Button>
            </ButtonToolbar>
          </Well>
        );
      }
    }
    user_remove_button(account_id: string, group?: string) {
      return (
        <Button
          disabled={group === "owner"}
          style={{ marginBottom: "0", float: "right" }}
          onClick={() => this.setState({ removing: account_id })}
        >
          <Icon name="user-times" /> Remove...
        </Button>
      );
    }
    render_user(user: any, is_last?: boolean) {
      return (
        <div
          key={user.account_id}
          style={!is_last ? { marginBottom: "20px" } : undefined}
        >
          <Row style={{ display: "flex", alignItems: "center" }}>
            <Col sm={8}>
              <User
                account_id={user.account_id}
                user_map={this.props.user_map}
                last_active={user.last_active}
                show_avatar={true}
              />
              <span>
                <Space />({user.group})
              </span>
            </Col>
            <Col sm={4}>
              {this.user_remove_button(user.account_id, user.group)}
            </Col>
          </Row>
          {this.state.removing === user.account_id
            ? this.render_user_remove_confirm(user.account_id)
            : undefined}
        </div>
      );
    }
    render_users() {
      const u = this.props.project.get("users");
      if (u === undefined) {
        return;
      }
      const users = u
        .map((v, k) => ({ account_id: k, group: v.get("group") }))
        .toList()
        .toJS();
      return this.props
        .sort_by_activity(users, this.props.project.get("project_id"))
        .map((u, i) => this.render_user(u, i === users.length - 1));
    }
    render_collaborators_list() {
      return (
        <Well
          style={{
            maxHeight: "20em",
            overflowY: "auto",
            overflowX: "hidden",
            marginBottom: "0",
          }}
        >
          {this.render_users()}
        </Well>
      );
    }
    render() {
      return (
        <SettingBox title="Current collaborators" icon="user">
          Anybody listed below can simultaneously work with you on any notebooks
          and terminals in this project, and add other people to this project.
          <hr />
          {this.render_collaborators_list()}
        </SettingBox>
      );
    }
  }
);
