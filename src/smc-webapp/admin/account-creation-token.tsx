/*
Input box for setting the account creation token.
*/

import {
  React,
  Rendered,
  Component,
  redux
} from "../frame-editors/generic/react";

import {Button, Well, FormGroup, FormControl} from "react-bootstrap";

import { query } from "../frame-editors/generic/client";

const {ErrorDisplay, Saving} = require("../r_misc");

interface State {
  state: "view" | "edit" | "save" ;
  token : string;
  error : string;
}

export class AccountCreationToken extends Component<{},State> {
  constructor(props) {
    super(props);
    this.state = {
      state: "view", // view --> edit --> save --> view
      token: "",
      error: ""
    };
  }

  edit() {
    this.setState({ state: "edit" });
  }

  async save(): Promise<void> {
    this.setState({ state: "save" });
    try {
      await query({
        query: {
          server_settings: {
            name: "account_creation_token",
            value: this.state.token
          }
        }
      });
      this.setState({ state: "view", error: "", token: "" });
    } catch (err) {
      this.setState({ state: "edit", error: err });
    }
  }

  render_save_button(): Rendered {
    return (
      <Button
        style={{ marginRight: "1ex" }}
        onClick={this.save}
        bsStyle="success"
      >
        Save token
      </Button>
    );
  }

  render_control() : Rendered {
    switch (this.state.state) {
      case "view":
        return (
          <Button onClick={this.edit} bsStyle="warning">
            Change token...
          </Button>
        );
      case "edit":
      case "save":
        return (
          <Well>
            <form onSubmit={this.save}>
              <FormGroup>
                <FormControl
                  ref="input"
                  type="text"
                  value={this.state.token}
                  onChange={e => this.setState({ token: (e.target as any).value })}
                />
              </FormGroup>
            </form>
            {this.render_save_button()}
            <Button onClick={() => this.setState({ state: "view", token: "" })}>
              Cancel
            </Button>
            <br />
            <br />
            (Set to empty to not require a token.)
          </Well>
        );
    }
  }

  render_error() {
    if (this.state.error) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onClose={() => this.setState({ error: "" })}
        />
      );
    }
  }

  render_save() {
    if (this.state.state === "save") {
      return <Saving />;
    }
  }

  render_unsupported() {
    // see https://github.com/sagemathinc/cocalc/issues/333
    return (
      <div style={{ color: "#666" }}>
        Not supported since some passport strategies are enabled.
      </div>
    );
  }

  render() {
    if (redux.getStore("account").get("strategies").size > 1) {
      return this.render_unsupported();
    }
    return (
      <div>
        {this.render_control()}
        {this.render_save()}
        {this.render_error()}
      </div>
    );
  }
}
