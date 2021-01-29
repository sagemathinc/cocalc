/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { redux, useRedux, CSS } from "../app-framework";
import { Well, Row, Col } from "react-bootstrap";
import { Space, Icon, SettingBox } from "../r_misc";
import { Project } from "smc-webapp/project/settings/types";
import { User } from "../users";
import { Popconfirm, Button } from "antd";

interface Props {
  project: Project;
  user_map?: any;
}

export const CurrentCollaboratorsPanel: React.FC<Props> = (props: Props) => {
  const { project, user_map } = props;
  const get_account_id = useRedux("account", "get_account_id");
  const sort_by_activity = useRedux("projects", "sort_by_activity");

  function remove_collaborator(account_id: string) {
    const project_id = project.get("project_id");
    redux.getActions("projects").remove_collaborator(project_id, account_id);
    if (account_id === get_account_id()) {
      return (redux.getActions("page") as any).close_project_tab(project_id); // TODO: better types
    }
  }

  function user_remove_confirm_text(account_id: string) {
    const style: CSS = { maxWidth: "300px" };
    if (account_id === get_account_id()) {
      return (
        <div style={style}>
          Are you sure you want to remove <b>yourself</b> from this project? You
          will no longer have access to this project and cannot add yourself
          back.
        </div>
      );
    } else {
      return (
        <div style={style}>
          Are you sure you want to remove{" "}
          <User account_id={account_id} user_map={user_map} /> from this
          project? They will no longer have access to this project.
        </div>
      );
    }
  }

  function user_remove_button(account_id: string, group?: string) {
    const text = user_remove_confirm_text(account_id);
    return (
      <Popconfirm
        title={text}
        onConfirm={() => remove_collaborator(account_id)}
        okText={"Yes, remove collaborator"}
        cancelText={"Cancel"}
      >
        <Button
          disabled={group === "owner"}
          style={{ marginBottom: "0", float: "right" }}
        >
          <Icon name="user-times" /> Remove...
        </Button>
      </Popconfirm>
    );
  }

  function render_user(user: any, is_last?: boolean) {
    return (
      <div
        key={user.account_id}
        style={!is_last ? { marginBottom: "20px" } : undefined}
      >
        <Row style={{ display: "flex", alignItems: "center" }}>
          <Col sm={8}>
            <User
              account_id={user.account_id}
              user_map={user_map}
              last_active={user.last_active}
              show_avatar={true}
            />
            <span>
              <Space />({user.group})
            </span>
          </Col>
          <Col sm={4}>{user_remove_button(user.account_id, user.group)}</Col>
        </Row>
      </div>
    );
  }

  function render_users() {
    const u = project.get("users");
    if (u === undefined) {
      return;
    }
    const users = u
      .map((v, k) => ({ account_id: k, group: v.get("group") }))
      .toList()
      .toJS();
    return sort_by_activity(users, project.get("project_id")).map((u, i) =>
      render_user(u, i === users.length - 1)
    );
  }

  function render_collaborators_list() {
    return (
      <Well
        style={{
          maxHeight: "20em",
          overflowY: "auto",
          overflowX: "hidden",
          marginBottom: "0",
        }}
      >
        {render_users()}
      </Well>
    );
  }

  return (
    <SettingBox title="Current collaborators" icon="user">
      Everybody listed below can collaboratively work with you on any notebooks,
      terminals or files in this project, and add or remove other collaborators.
      <hr />
      {render_collaborators_list()}
    </SettingBox>
  );
};
