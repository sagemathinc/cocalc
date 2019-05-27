import { React, Component, Rendered } from "smc-webapp/app-framework";

import { Button } from "react-bootstrap";

const { Icon, ErrorDisplay } = require("smc-webapp/r_misc");

const { webapp_client } = require("../../webapp_client");

import { callback2 } from "smc-util/async-utils";

interface Props {
  account_id?: string;
  banned?: boolean;
}

interface State {
  error?: string;
  running: boolean;
  link?: string;
  banned: boolean;
}

export class Ban extends Component<Props, State> {
  mounted: boolean = true;

  constructor(props: any) {
    super(props);
    this.state = { running: false, banned: !!props.banned };
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  async do_request(): Promise<void> {
    this.setState({ running: true });
    try {
      await callback2(webapp_client.admin_ban_user, {
        account_id: this.props.account_id,
        ban: !this.state.banned
      });
      this.setState({ running: false, banned: !this.state.banned });
    } catch (err) {
      if (!this.mounted) return;
      this.setState({ error: `${err}`, running: false });
    }
  }

  render_ban_button(): Rendered {
    return (
      <Button
        disabled={this.state.running}
        onClick={() => {
          this.do_request();
        }}
      >
        <Icon
          name={this.state.running ? "sync" : "unlock-alt"}
          spin={this.state.running}
        />{" "}
        {this.state.banned ? "Unban" : "Ban"} User
      </Button>
    );
  }

  render_error(): Rendered {
    if (!this.state.error) {
      return;
    }
    return (
      <ErrorDisplay
        error={this.state.error}
        onClick={() => {
          this.setState({ error: undefined });
        }}
      />
    );
  }

  render(): Rendered {
    return (
      <div>
        <b>
          User is currently{" "}
          {this.state.banned
            ? "banned:"
            : "NOT banned:  If you ban them, they lose access to their account.  (NOTE: you can easily *unban* a banned user.)"}
        </b>
        <br />
        <br />
        {this.render_error()}
        {this.render_ban_button()}
        <br />
        <br />
      </div>
    );
  }
}
