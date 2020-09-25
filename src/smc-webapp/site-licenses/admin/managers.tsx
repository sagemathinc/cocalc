/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
import { Component, React, Rendered, redux } from "../../app-framework";
import { ManagerInfo } from "./types";
import { UserMap } from "../../todo-types";
import { User } from "../../users";
import { r_join, Space } from "../../r_misc";
import { Button } from "../../antd-bootstrap";
import { Popconfirm } from "antd";
import { alert_message } from "../../alerts";

export interface DisplayProps {
  managers: undefined | List<string>;
  user_map?: UserMap;
  license_id: string;
  manager_info?: ManagerInfo;
}

interface State {
  add_value: string;
}

export class Managers extends Component<DisplayProps, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { add_value: "" };
  }

  private show_manager_info(account_id?: string | undefined): void {
    const actions = redux.getActions("admin-site-licenses");
    actions.show_manager_info(this.props.license_id, account_id);
  }

  private async remove_manager(account_id: string): Promise<void> {
    const actions = redux.getActions("admin-site-licenses");
    this.show_manager_info();
    try {
      await actions.remove_manager(this.props.license_id, account_id);
      await actions.load();
    } catch (err) {
      alert_message({ type: "error", message: err });
    }
  }

  private render_manager_buttons(account_id: string): Rendered {
    return (
      <div style={{ float: "right" }}>
        <Popconfirm
          title={
            "Are you sure you want to remove this user as a manager of this license?"
          }
          onConfirm={() => this.remove_manager(account_id)}
          okText={"Yes"}
          cancelText={"Cancel"}
        >
          <Button>Remove this manager...</Button>
        </Popconfirm>
        <Space />
        <Button onClick={() => this.show_manager_info()}>Close</Button>
      </div>
    );
  }

  private render_manager_info(): Rendered {
    if (this.props.manager_info == null || this.props.user_map == null) return;
    const account_id: string = this.props.manager_info.get("account_id");
    return (
      <div
        style={{
          margin: "15px",
          border: "1px solid lightgrey",
          padding: "10px",
          boxShadow: "3px 3px lightgrey",
        }}
      >
        {this.render_manager_buttons(account_id)}
        <h4 style={{ marginBottom: "20px", color: "#666" }}>
          <User account_id={account_id} user_map={this.props.user_map} />
        </h4>
        <pre>
          {JSON.stringify(this.props.manager_info.toJS(), undefined, 2)}
        </pre>
      </div>
    );
  }

  private render_user(account_id: string): Rendered {
    if (this.props.user_map == null) {
      throw Error("bug");
    }
    return (
      <a onClick={() => this.show_manager_info(account_id)} key={account_id}>
        <User account_id={account_id} user_map={this.props.user_map} />
      </a>
    );
  }

  private async add_manager(): Promise<void> {
    const actions = redux.getActions("admin-site-licenses");
    const value = this.state.add_value.trim();
    if (!value) return;
    this.setState({ add_value: "" });
    try {
      await actions.add_manager(this.props.license_id, value);
      await actions.load();
    } catch (err) {
      alert_message({ type: "error", message: err });
    }
  }

  private render_add(): JSX.Element {
    return (
      <div style={{ float: "right" }}>
        <input
          style={{ width: "40ex" }}
          placeholder="Email address, account_id or name..."
          value={this.state.add_value}
          onChange={(e) =>
            this.setState({ add_value: (e.target as any).value })
          }
          onKeyUp={(e) => {
            if (e.keyCode === 13) {
              this.add_manager();
            }
          }}
        />
        <Space />
        <Button
          disabled={!this.state.add_value.trim()}
          onClick={() => this.add_manager()}
        >
          Add manager
        </Button>
      </div>
    );
  }

  public render(): JSX.Element {
    if (this.props.user_map == null) {
      return <span />;
    }
    const v: Rendered[] = [];
    for (const account_id of this.props.managers ?? []) {
      v.push(this.render_user(account_id));
    }
    if (v.length == 0) {
      return this.render_add();
    }
    return (
      <div>
        {this.render_add()}
        <div>{r_join(v, ", ")}</div>
        {this.render_manager_info()}
      </div>
    );
  }
}
