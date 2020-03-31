import { React, Component, Rendered } from "smc-webapp/app-framework";

import { Button } from "react-bootstrap";

import { Icon, ErrorDisplay, TimeAgo } from "smc-webapp/r_misc";

import { webapp_client} from "../../webapp-client";

interface Props {
  account_id: string;
}

interface State {
  subscriptions?: any;
  sync: "none" | "running" | "done"; // weather or not currently syncing.
  error?: string;
  sync_time?: Date;
}

export class Subscriptions extends Component<Props, State> {
  mounted: boolean = true;

  constructor(props: any) {
    super(props);
    this.state = { sync: "none" };
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  async sync(): Promise<void> {
    try {
      this.setState({ sync: "running" });
      await webapp_client.stripe.admin_create_customer({
        account_id: this.props.account_id,
      });
    } catch (err) {
      if (this.mounted) {
        this.setState({ error: err, sync: "none" });
      }
    } finally {
      if (this.mounted) {
        this.setState({ sync: "done", sync_time: new Date() });
      }
    }
  }

  render_stripe_sync_state(): Rendered {
    switch (this.state.sync) {
      case "running":
        return <span>Syncing...</span>;
      case "none":
        return <span>Sync with Stripe</span>;
      case "done":
        return (
          <span>
            Synced with Stripe (<TimeAgo date={this.state.sync_time} />){" "}
          </span>
        );
    }
  }

  render_stripe_sync_button(): Rendered {
    return (
      <Button
        disabled={this.state.sync === "running"}
        onClick={() => {
          this.sync();
        }}
      >
        <Icon
          name={this.state.sync === "done" ? "check-circle" : "sync"}
          spin={this.state.sync === "running"}
        />{" "}
        {this.render_stripe_sync_state()}
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
        onClose={() => {
          this.setState({ error: undefined });
        }}
      />
    );
  }

  render(): Rendered {
    return (
      <div>
        <b>Subscriptions:</b>
        <br />
        {this.render_error()}
        {this.render_stripe_sync_button()}
        <br />
        <br />
      </div>
    );
  }
}
