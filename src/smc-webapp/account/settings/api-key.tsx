/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// API Key Configuration
import { React, Component, Rendered, ReactDOM } from "../../app-framework";
import {
  CloseX,
  CopyToClipBoard,
  ErrorDisplay,
  LabeledRow,
  Loading,
} from "../../r_misc";
import { webapp_client } from "../../webapp-client";
import { Button, FormControl, Well } from "../../antd-bootstrap";
import { startswith } from "smc-util/misc2";

/*
The states are:
  'init'     - initial state -- show nothing and wait to click to request to view key; no info
  'error'    - showing an error
  'password' - requesting password from user
  'loading'  - loading something from backend (doing api call)
  'showkey'  - showing the api key (or that there is none)
  'confirm-get' - confirming getting API key (isn't used)
  'confirm-delete' - confirming delete of API key
  'confirm-regenerate' - confirming regenerate of API key
*/

type Action = "get" | "delete" | "regenerate";
type State =
  | "error"
  | "init"
  | "loading"
  | "password"
  | "showkey"
  | "confirm-get"
  | "confirm-delete"
  | "confirm-regenerate";

interface ComponentState {
  api_key?: string; // set, if it has been loaded
  password: string; // must be defined so that input control is controlled
  error?: string;
  state: State;
}

export class APIKeySetting extends Component<{}, ComponentState> {
  private mounted: boolean = true;

  constructor(props, state) {
    super(props, state);
    this.state = {
      password: "",
      state: "init",
    };
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  private render_confirm(): Rendered {
    let action: Action, mesg: string;
    switch (this.state.state) {
      case "confirm-delete":
        action = "delete";
        mesg = "Are you sure you want to delete your API key?  ";
        break;
      case "confirm-regenerate":
        action = "regenerate";
        mesg = "Are you sure you want to regenerate your API key?  ";
        break;
      default:
        throw Error("bug -- invalid state for render_confirm");
    }
    return (
      <div>
        {mesg}{" "}
        <b>
          <i>Anything using the current API key will stop working.</i>
        </b>
        <br />
        <br />
        <Button onClick={() => this.setState({ state: "showkey" })}>
          Cancel
        </Button>
        <Button
          onClick={() => this.do_action(action)}
          style={{ marginLeft: "5px" }}
          bsStyle="danger"
        >
          Yes
        </Button>
      </div>
    );
  }

  private async do_action(action: Action): Promise<void> {
    this.setState({ state: "loading" });
    try {
      const api_key = await webapp_client.account_client.api_key(
        action,
        this.state.password
      );
      if (this.mounted) {
        this.setState({ api_key, state: "showkey" });
      }
    } catch (err) {
      if (this.mounted) {
        this.setState({
          error: err,
          password: "",
          api_key: undefined,
          state: "error",
        });
      }
    }
  }

  private render_api_key(): Rendered {
    if (this.state.api_key) {
      return (
        <div>
          <CopyToClipBoard
            value={this.state.api_key}
            style={{ display: "inline-block", width: "100%" }}
          />
          {this.render_button("delete", "Delete key")}
          <span style={{ marginRight: "5px" }}></span>
          {this.render_button("regenerate", "Regenerate key")}
        </div>
      );
    } else {
      return (
        <div>
          You do not have an API key.
          <br />
          <br />
          {this.render_button("regenerate", "Create API Key")}
        </div>
      );
    }
  }

  private click_action_button(action: Action): void {
    switch (this.state.state) {
      case "init":
        this.setState({ state: "password" });
        return;
      case "password":
        this.do_action(action);
        return;
      case "showkey":
        if (this.state.api_key) {
          // Typescript isn't smart enough for this...
          this.setState({ state: `confirm-${action}` as State });
        } else {
          this.do_action(action);
        }
        return;
    }
  }

  private render_button(
    action: Action,
    name: string | undefined = undefined,
    disabled: boolean = false
  ): Rendered {
    if (name == null) {
      switch (action) {
        case "get":
          name = "Reveal Key";
          break;
        case "delete":
          name = "Delete Key";
          break;
        case "regenerate":
          name = "Regenerate Key";
          break;
      }
    }
    if (startswith(this.state.state, "confirm-")) {
      disabled = true;
    }
    return (
      <Button
        onClick={() => this.click_action_button(action)}
        disabled={disabled}
      >
        {name}
        {this.state.api_key || this.state.state === "init" ? "..." : ""}
      </Button>
    );
  }

  private render_get_password(): Rendered {
    return (
      <div style={{ display: "flex" }}>
        <FormControl
          autoFocus
          style={{ flex: 1, marginRight: "5px" }}
          type="password"
          ref="password"
          placeholder="Current password"
          value={this.state.password}
          onChange={() =>
            this.setState({
              password: ReactDOM.findDOMNode(this.refs.password).value,
            })
          }
        />
        {this.render_button(
          "get",
          undefined,
          !this.state.password && this.state.password.length > 6
        )}
      </div>
    );
  }

  private render_content(): Rendered {
    if (this.state.error) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onClose={() =>
            this.setState({ error: "", state: "init", password: "" })
          }
        />
      );
    }
    switch (this.state.state) {
      case "loading":
        return <Loading />;
      case "password":
        return this.render_get_password();
      case "showkey":
        return this.render_api_key();
      case "confirm-delete":
      case "confirm-regenerate":
        return (
          <span>
            {this.render_api_key()}
            <br />
            {this.render_confirm()}
          </span>
        );
    }
  }

  private render_close(): Rendered {
    return (
      <CloseX
        on_close={() => this.setState({ password: "", state: "init" })}
        style={{ marginRight: "5px", marginLeft: "20px" }}
      />
    );
  }

  private render_workaround(): Rendered {
    if (this.state.state != "password") return;
    return (
      <>
        <hr />
        NOTE: If you do not have a password set, there is{" "}
        <a
          href="https://github.com/sagemathinc/cocalc/wiki/password"
          target="_blank"
          rel="noopener"
        >
          a workaround to generate your API key.
        </a>
      </>
    );
  }

  private render_docs(): Rendered {
    return (
      <div>
        <hr />
        <span style={{ color: "#666" }}>
          <a href="https://doc.cocalc.com/api/" target="_blank" rel="noopener">
            Learn about the API...
          </a>
          {this.render_workaround()}
        </span>
      </div>
    );
  }

  private render_well(): Rendered {
    return (
      <Well>
        {this.render_close()}
        {this.render_content()}
        {this.render_docs()}
      </Well>
    );
  }

  private render_init(): Rendered {
    return <div className="pull-right">{this.render_button("get")}</div>;
  }

  public render(): Rendered {
    return (
      <LabeledRow label="API key">
        <div style={{ minHeight: "30px" }}>
          {this.state.state === "init"
            ? this.render_init()
            : this.render_well()}
        </div>
      </LabeledRow>
    );
  }
}
