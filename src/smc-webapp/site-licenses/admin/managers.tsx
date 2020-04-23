import { List } from "immutable";
import { Component, React, Rendered, redux } from "../../app-framework";
import { license_field_names, ManagerInfo } from "./types";
import { UserMap } from "../../todo-types";
import { User } from "../../users";
import { r_join, Space } from "../../r_misc";
import { Button } from "../../antd-bootstrap";
import { Popconfirm } from "antd";

export interface DisplayProps {
  managers: undefined | List<string>;
  user_map?: UserMap;
  license_id: string;
  manager_info?: ManagerInfo;
}
export class DisplayManagers extends Component<DisplayProps> {
  private show_manager_info(account_id?: string | undefined): void {
    redux
      .getActions("admin-site-licenses")
      .show_manager_info(this.props.license_id, account_id);
  }

  private remove_manager(account_id: string): void {
    redux
      .getActions("admin-site-licenses")
      .remove_manager(this.props.license_id, account_id);
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
          <Button>Remove as manager...</Button>
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
  public render(): Rendered {
    if (this.props.managers == null || this.props.user_map == null) {
      return <span />;
    }
    const v: Rendered[] = [];
    for (const account_id of this.props.managers ?? []) {
      v.push(this.render_user(account_id));
    }
    return (
      <div>
        <div>{r_join(v, ", ")}</div>
        {this.render_manager_info()}
      </div>
    );
  }
}

export interface EditProps {
  license_id: string;
  license_field: license_field_names;
  managers: undefined | List<string>;
  onChange: Function;
}

export class EditManagers extends Component<EditProps> {
  private render_add_search() {
    return <input />;
  }

  public render(): Rendered {
    return (
      <div>
        <pre>{JSON.stringify(this.props.managers?.toJS(), undefined, 2)}</pre>
        <br />
        {this.render_add_search()}
      </div>
    );
  }
}
