import { React, Component, Rendered, ReactDOM } from "../../app-framework";
import { alert_message } from "../../alerts";
import { log } from "../../user-tracking";
import { ErrorDisplay, LabeledRow, Saving } from "../../r_misc";
import {
  Button,
  ButtonToolbar,
  Well,
  FormGroup,
  FormControl,
} from "../../antd-bootstrap";
import { webapp_client } from "../../webapp-client";

interface Props {
  account_id: string;
  email_address?: string;
  disabled?: boolean;
  is_anonymous?: boolean;
  verify_emails?: boolean;
}

interface State {
  state: "view" | "edit" | "saving"; // view --> edit --> saving --> view or edit
  password: string;
  email_address: string; // The new email address
  error: string;
}

export class EmailAddressSetting extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { state: "view", password: "", email_address: "", error: "" };
  }

  private start_editing(): void {
    this.setState({
      state: "edit",
      email_address:
        this.props.email_address != null ? this.props.email_address : "",
      error: "",
      password: "",
    });
  }

  private cancel_editing(): void {
    this.setState({
      state: "view",
      password: "",
    }); // more secure...
  }

  private async save_editing(): Promise<void> {
    if (this.state.password.length < 6) {
      this.setState({
        state: "edit",
        error: "Password must be at least 6 characters long.",
      });
      return;
    }
    this.setState({
      state: "saving",
    });
    try {
      await webapp_client.account_client.change_email(
        this.state.email_address,
        this.state.password
      );
    } catch (error) {
      this.setState({
        state: "edit",
        error: `Error -- ${error}`,
      });
      return;
    }
    if (this.props.is_anonymous) {
      log("email_sign_up", { source: "anonymous_account" });
    }
    this.setState({
      state: "view",
      error: "",
      password: "",
    });
    // if email verification is enabled, send out a token
    // in any case, send a welcome email to an anonymous user, possibly
    // including an email verification link
    if (!(this.props.verify_emails || this.props.is_anonymous)) {
      return;
    }
    try {
      // anonymouse users will get the "welcome" email
      await webapp_client.account_client.send_verification_email(
        !this.props.is_anonymous
      );
    } catch (error) {
      const err_msg = `Problem sending welcome email: ${error}`;
      console.log(err_msg);
      alert_message({ type: "error", message: err_msg });
    }
  }

  private is_submittable(): boolean {
    return !!(
      this.state.password !== "" &&
      this.state.email_address !== this.props.email_address
    );
  }

  private render_change_button(): Rendered {
    return (
      <Button
        disabled={!this.is_submittable()}
        onClick={this.save_editing.bind(this)}
        bsStyle="success"
      >
        {this.button_label()}
      </Button>
    );
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
    const password_label = this.props.email_address
      ? "Current password"
      : "Choose a password";
    return (
      <Well style={{ marginTop: "3ex" }}>
        <FormGroup>
          New email address
          <FormControl
            autoFocus
            type="email_address"
            ref="email_address"
            value={this.state.email_address}
            placeholder="user@example.com"
            onChange={() =>
              this.setState({
                email_address: ReactDOM.findDOMNode(this.refs.email_address)
                  .value,
              })
            }
            maxLength={254}
          />
        </FormGroup>
        {password_label}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (this.is_submittable()) {
              return this.save_editing();
            }
          }}
        >
          <FormGroup>
            <FormControl
              type="password"
              ref="password"
              value={this.state.password}
              placeholder={password_label}
              onChange={() =>
                this.setState({
                  password: ReactDOM.findDOMNode(this.refs.password).value,
                })
              }
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

  private button_label(): string {
    if (this.props.is_anonymous) {
      return "Sign up using an email address and password";
    } else if (this.props.email_address) {
      return "Change email address";
    } else {
      return "Set email address and password";
    }
  }

  public render(): Rendered {
    const label = this.props.is_anonymous ? (
      <h5 style={{ color: "#666" }}>
        Sign up using an email address and password
      </h5>
    ) : (
      "Email address"
    );
    return (
      <LabeledRow
        label={label}
        style={this.props.disabled ? { color: "#666" } : undefined}
      >
        <div>
          {this.props.email_address}
          {this.state.state === "view" ? (
            <Button
              disabled={this.props.disabled}
              className="pull-right"
              onClick={this.start_editing.bind(this)}
            >
              {this.button_label()}...
            </Button>
          ) : undefined}
        </div>
        {this.state.state !== "view" ? this.render_edit() : undefined}
      </LabeledRow>
    );
  }
}
