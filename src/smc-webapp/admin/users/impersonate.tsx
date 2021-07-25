/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Loading } from "smc-webapp/r_misc";
import { webapp_client } from "smc-webapp/webapp-client";
import { join } from "path";

interface Props {
  account_id: string;
  first_name: string;
  last_name: string;
}

interface State {
  auth_token?: string;
  err?: string;
}

export class Impersonate extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {};
  }

  async get_token(): Promise<void> {
    try {
      const auth_token = await webapp_client.admin_client.get_user_auth_token(
        this.props.account_id
      );
      this.setState({ auth_token });
    } catch (err) {
      this.setState({ err: err.toString() });
    }
  }

  componentDidMount(): void {
    this.get_token();
  }

  render_link(): Rendered {
    if (this.state.auth_token == null) {
      return <Loading />;
    }
    const link = join(window.app_base_path, `settings/support/app?auth_token=${this.state.auth_token}`);
    return (
      <div>
        <a href={link} target="_blank" rel="noopener noreferrer">
          Right click and open this link in a new incognito window, where you
          will be signed in as {this.props.first_name} {this.props.last_name}...
        </a>
        <br />
        The actual link:
        <pre style={{ fontSize: "11pt", textAlign: "center" }}>
          <a href={link} target="_blank" rel="noopener noreferrer">
            {link}
          </a>
        </pre>
      </div>
    );
  }

  render_err(): Rendered {
    if (this.state.err != null) {
      return (
        <div>
          <b>ERROR</b> {this.state.err}
        </div>
      );
    }
  }

  render(): Rendered {
    return (
      <div
        style={{
          padding: "15px",
          border: "1px solid red",
          borderRadius: "3px",
          fontSize: "14pt",
          margin: "15px",
        }}
      >
        <b>
          Impersonate user "{this.props.first_name} {this.props.last_name}"
        </b>
        <br />
        {this.render_err()}
        {this.render_link()}
      </div>
    );
  }
}
