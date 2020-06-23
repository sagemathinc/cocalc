/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ErrorDisplay, LabeledRow, Saving } from "../../r_misc";
import { React, Component, Rendered, ReactDOM } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import {
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Well,
} from "../../antd-bootstrap";

interface State {
  state: "view" | "edit" | "saving"; // view --> edit --> saving --> view
  old_password: string;
  new_password: string;
  error: string;
}

export class PasswordSetting extends Component<{}, State> {
  private is_mounted: boolean = true;
  constructor(props, state) {
    super(props, state);
    this.state = {
      state: "view",
      old_password: "",
      new_password: "",
      error: "",
    };
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
  }

  private change_password(): void {
    this.setState({
      state: "edit",
      error: "",
      old_password: "",
      new_password: "",
    });
  }

  private cancel_editing(): void {
    this.setState({
      state: "view",
      old_password: "",
      new_password: "",
    });
  }

  private async save_new_password(): Promise<void> {
    this.setState({
      state: "saving",
    });
    try {
      await webapp_client.account_client.change_password(
        this.state.old_password,
        this.state.new_password
      );
      if (!this.is_mounted) return;
    } catch (err) {
      if (!this.is_mounted) return;
      this.setState({
        state: "edit",
        error: `Error changing password -- ${err}`,
      });
      return;
    }
    this.setState({
      state: "view",
      error: "",
      old_password: "",
      new_password: "",
    });
  }

  private is_submittable(): boolean {
    return !!(
      this.state.new_password.length >= 6 &&
      this.state.new_password &&
      this.state.new_password !== this.state.old_password
    );
  }

  private render_change_button(): Rendered {
    if (this.is_submittable()) {
      return (
        <Button onClick={this.save_new_password.bind(this)} bsStyle="success">
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

  private render_error(): Rendered {
    if (this.state.error) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onClose={() => this.setState({ error: "" })}
          style={{ marginTop: "15px" }}
        />
      );
    }
  }

  private render_edit(): Rendered {
    return (
      <Well style={{ marginTop: "3ex" }}>
        <FormGroup>
          Current password{" "}
          <span color="#888">(leave blank if you have not set a password)</span>
          <FormControl
            autoFocus
            type="password"
            ref="old_password"
            value={this.state.old_password}
            placeholder="Current password"
            onChange={() =>
              this.setState({
                old_password: ReactDOM.findDOMNode(this.refs.old_password)
                  .value,
              })
            }
          />
        </FormGroup>
        New password
        {this.state.new_password.length < 6
          ? " (at least 6 characters)"
          : undefined}
        {this.state.new_password.length >= 6 &&
        this.state.new_password == this.state.old_password
          ? " (different than old password)"
          : undefined}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (this.is_submittable()) {
              this.save_new_password();
            }
          }}
        >
          <FormGroup>
            <FormControl
              type="password"
              ref="new_password"
              value={this.state.new_password}
              placeholder="New password"
              onChange={() => {
                const x = ReactDOM.findDOMNode(this.refs.new_password)?.value;
                if (x == null) return;
                this.setState({ new_password: x });
              }}
            />
          </FormGroup>
        </form>
        <ButtonToolbar>
          {this.render_change_button()}
          <Button onClick={this.cancel_editing.bind(this)}>Cancel</Button>
        </ButtonToolbar>
        {this.render_error()}
        {this.render_saving()}
      </Well>
    );
  }

  private render_saving(): Rendered {
    if (this.state.state === "saving") {
      return <Saving />;
    }
  }

  render() {
    return (
      <LabeledRow label="Password" style={{ marginBottom: "15px" }}>
        <div style={{ height: "30px" }}>
          <Button
            className="pull-right"
            disabled={this.state.state !== "view"}
            onClick={this.change_password.bind(this)}
          >
            Change Password...
          </Button>
        </div>
        {this.state.state !== "view" ? this.render_edit() : undefined}
      </LabeledRow>
    );
  }
}
