/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
import { React, redux, useState, useTypedRedux } from "../../app-framework";
import { ManagerInfo } from "./types";
import { User } from "../../users";
import { r_join, Space } from "../../r_misc";
import { Button } from "../../antd-bootstrap";
import { Popconfirm } from "antd";
import { alert_message } from "../../alerts";

export interface Props {
  managers: undefined | List<string>;
  license_id: string;
  manager_info?: ManagerInfo;
}

export const Managers: React.FC<Props> = ({
  managers,
  license_id,
  manager_info,
}) => {
  const [add_value, set_add_value] = useState<string>("");
  const user_map = useTypedRedux("users", "user_map");

  function show_manager_info(account_id?: string | undefined): void {
    const actions = redux.getActions("admin-site-licenses");
    actions.show_manager_info(license_id, account_id);
  }

  async function remove_manager(account_id: string): Promise<void> {
    const actions = redux.getActions("admin-site-licenses");
    show_manager_info();
    try {
      await actions.remove_manager(license_id, account_id);
      await actions.load();
    } catch (err) {
      alert_message({ type: "error", message: err });
    }
  }

  function render_manager_buttons(account_id: string): JSX.Element {
    return (
      <div style={{ float: "right" }}>
        <Popconfirm
          title={
            "Are you sure you want to remove this user as a manager of this license?"
          }
          onConfirm={() => remove_manager(account_id)}
          okText={"Yes"}
          cancelText={"Cancel"}
        >
          <Button>Remove this manager...</Button>
        </Popconfirm>
        <Space />
        <Button onClick={() => show_manager_info()}>Close</Button>
      </div>
    );
  }

  function render_manager_info(): JSX.Element | void {
    if (manager_info == null || user_map == null) return;
    const account_id: string = manager_info.get("account_id");
    return (
      <div
        style={{
          margin: "15px",
          border: "1px solid lightgrey",
          padding: "10px",
          boxShadow: "3px 3px lightgrey",
        }}
      >
        {render_manager_buttons(account_id)}
        <h4 style={{ marginBottom: "20px", color: "#666" }}>
          <User account_id={account_id} user_map={user_map} />
        </h4>
        <pre>{JSON.stringify(manager_info.toJS(), undefined, 2)}</pre>
      </div>
    );
  }

  function render_user(account_id: string): JSX.Element {
    if (user_map == null) {
      throw Error("bug");
    }
    return (
      <a onClick={() => show_manager_info(account_id)} key={account_id}>
        <User account_id={account_id} user_map={user_map} />
      </a>
    );
  }

  async function add_manager(): Promise<void> {
    const actions = redux.getActions("admin-site-licenses");
    const value = add_value.trim();
    if (!value) return;
    set_add_value("");
    try {
      await actions.add_manager(license_id, value);
      await actions.load();
    } catch (err) {
      alert_message({ type: "error", message: err });
    }
  }

  function render_add(): JSX.Element {
    return (
      <div style={{ float: "right" }}>
        <input
          style={{ width: "40ex" }}
          placeholder="Email address, account_id or name..."
          value={add_value}
          onChange={(e) => set_add_value((e.target as any).value)}
          onKeyUp={(e) => {
            if (e.keyCode === 13) {
              add_manager();
            }
          }}
        />
        <Space />
        <Button disabled={!add_value.trim()} onClick={() => add_manager()}>
          Add manager
        </Button>
      </div>
    );
  }

  if (user_map == null) {
    return <span />;
  }
  const v: JSX.Element[] = [];
  for (const account_id of managers ?? []) {
    v.push(render_user(account_id));
  }
  if (v.length == 0) {
    return render_add();
  }
  return (
    <div>
      {render_add()}
      <div>{r_join(v, ", ")}</div>
      {render_manager_info()}
    </div>
  );
};
