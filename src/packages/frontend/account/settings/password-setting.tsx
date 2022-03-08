/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  A,
  ErrorDisplay,
  LabeledRow,
  Saving,
} from "@cocalc/frontend/components";
import {
  Rendered,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, ButtonToolbar, Well } from "@cocalc/frontend/antd-bootstrap";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import { Form, Input } from "antd";

interface State {
  state: "view" | "edit" | "saving"; // view --> edit --> saving --> view
  old_password: string;
  new_password: string;
  error: string;
}

export const PasswordSetting: React.FC = () => {
  const is_mounted = useIsMountedRef();

  const [state, set_state] = useState<State["state"]>("view");
  const [old_password, set_old_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [error, set_error] = useState("");

  function reset(): void {
    set_state("view");
    set_error("");
    set_old_password("");
    set_new_password("");
  }

  function change_password(): void {
    reset();
    set_state("edit");
  }

  function cancel_editing(): void {
    set_state("view");
    set_old_password("");
    set_new_password("");
  }

  async function save_new_password(): Promise<void> {
    set_state("saving");
    try {
      await webapp_client.account_client.change_password(
        old_password,
        new_password
      );
      if (!is_mounted.current) return;
    } catch (err) {
      if (!is_mounted.current) return;
      set_state("edit"), set_error(`Error changing password -- ${err}`);
      return;
    }
    reset();
  }

  function is_submittable(): boolean {
    return !!(
      new_password.length >= 6 &&
      new_password &&
      new_password !== old_password
    );
  }

  function render_change_button(): Rendered {
    if (is_submittable()) {
      return (
        <Button onClick={save_new_password} bsStyle="success">
          Change Password
        </Button>
      );
    } else {
      return (
        <Button disabled bsStyle="success">
          Change Password
        </Button>
      );
    }
  }

  function render_error(): Rendered {
    if (error) {
      return (
        <>
          <ErrorDisplay
            error={error}
            onClose={() => set_error("")}
            style={{ marginTop: "15px" }}
          />
          <A href={join(appBasePath, "auth/password-reset")}>
            Forgot Password?
          </A>
        </>
      );
    }
  }

  function onFinish(): void {
    if (is_submittable()) {
      save_new_password();
    }
  }

  function render_edit(): Rendered {
    return (
      <Well style={{ marginTop: "3ex" }}>
        <Form onFinish={onFinish}>
          <Form.Item>
            Current password{" "}
            <span color="#888">
              (leave blank if you have not set a password)
            </span>
            <Input.Password
              autoFocus
              type="password"
              value={old_password}
              placeholder="Current password"
              onChange={(e) => set_old_password(e.target.value)}
            />
          </Form.Item>
          New password
          {new_password.length < 6 ? " (at least 6 characters)" : undefined}
          {new_password.length >= 6 && new_password == old_password
            ? " (different than old password)"
            : undefined}
          <Form.Item>
            <Input.Password
              type="password"
              value={new_password}
              placeholder="New password"
              onChange={(e) => {
                set_new_password(e.target.value);
              }}
            />
          </Form.Item>
        </Form>
        <ButtonToolbar>
          {render_change_button()}
          <Button onClick={cancel_editing}>Cancel</Button>
        </ButtonToolbar>
        {render_error()}
        {render_saving()}
      </Well>
    );
  }

  function render_saving(): Rendered {
    if (state === "saving") {
      return <Saving />;
    }
  }

  return (
    <LabeledRow label="Password" style={{ marginBottom: "15px" }}>
      <div style={{ height: "30px" }}>
        <Button
          className="pull-right"
          disabled={state !== "view"}
          onClick={change_password}
        >
          Change Password...
        </Button>
      </div>
      {state !== "view" ? render_edit() : undefined}
    </LabeledRow>
  );
};
