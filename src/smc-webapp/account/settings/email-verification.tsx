import { Map } from "immutable";

import { Component, React, Rendered } from "../../app-framework";
import { alert_message } from "../../alerts";
import { Button } from "../../antd-bootstrap";
import { webapp_client } from "../../webapp-client";
import { LabeledRow } from "../../r_misc";

interface Props {
  email_address?: string;
  email_address_verified?: Map<string, boolean>;
}

interface State {
  disabled_button: boolean;
}

export class EmailVerification extends Component<Props, State> {
  private is_mounted: boolean = true;
  constructor(props, state) {
    super(props, state);
    this.state = { disabled_button: false };
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  componentWillReceiveProps(next) {
    if (next.email_address !== this.props.email_address) {
      this.setState({ disabled_button: false });
    }
  }

  private async verify(): Promise<void> {
    try {
      await webapp_client.account_client.send_verification_email();
    } catch (err) {
      const err_msg = `Problem sending email verification: ${err}`;
      console.log(err_msg);
      alert_message({ type: "error", message: err_msg });
    } finally {
      if (this.is_mounted) {
        this.setState({ disabled_button: true });
      }
    }
  }

  private render_status(): Rendered {
    if (this.props.email_address == null) {
      return <span>Unknown</span>;
    } else {
      if (this.props.email_address_verified?.get(this.props.email_address)) {
        return <span style={{ color: "green" }}>Verified</span>;
      } else {
        return (
          <>
            <span key={1} style={{ color: "red", paddingRight: "3em" }}>
              Not Verified
            </span>
            <Button
              onClick={this.verify.bind(this)}
              bsStyle="success"
              disabled={this.state.disabled_button}
            >
              {this.state.disabled_button
                ? "Email Sent"
                : "Send Verification Email"}
            </Button>
          </>
        );
      }
    }
  }

  render() {
    return (
      <LabeledRow label="Email verification" style={{ marginBottom: "15px" }}>
        <div>Status: {this.render_status()}</div>
      </LabeledRow>
    );
  }
}
