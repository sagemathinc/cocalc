/* Dialog that is displayed when a person forgets their password
   and requests a reset.
*/

import * as React from "react";
import { Row, FormGroup, FormControl, Modal, Button } from "react-bootstrap";
import { bind_methods, is_valid_email_address } from "smc-util/misc2";
import { Rendered } from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { Icon } from "../r_misc/icon";

import { actions } from "./util";

interface Props {
  initial_email_address: string;
  forgot_password_error: string;
  forgot_password_success: string;
}

interface State {
  email_address: string;
  is_email_valid: boolean;
}

export class ForgotPassword extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {
      email_address: this.props.initial_email_address,
      is_email_valid: is_valid_email_address(this.props.initial_email_address)
    };
    bind_methods(this, [
      "forgot_password",
      "set_email",
      "hide_forgot_password"
    ]);
  }

  forgot_password(e): void {
    e.preventDefault();
    const value = this.state.email_address;
    if (is_valid_email_address(value)) {
      actions("account").forgot_password(value);
    }
  }

  set_email(evt): void {
    const email_address = evt.target.value;
    this.setState({
      email_address,
      is_email_valid: is_valid_email_address(email_address)
    });
  }

  hide_forgot_password(): void {
    const a = actions("account");
    a.setState({ show_forgot_password: false });
    a.setState({ forgot_password_error: undefined });
    a.setState({ forgot_password_success: undefined });
  }

  render_error(): Rendered {
    if (this.props.forgot_password_error == null) return;
    return (
      <span style={{ color: "red" }}>{this.props.forgot_password_error}</span>
    );
  }

  render_success(): Rendered {
    if (this.props.forgot_password_success == null) return;
    const s = this.props.forgot_password_success.split(
      "check your spam folder"
    );
    return (
      <span>
        {s[0]}
        <span style={{ color: "red", fontWeight: "bold" }}>
          check your spam folder
        </span>
        {s[1]}
      </span>
    );
  }

  render_valid_message(): Rendered {
    if (this.state.email_address != "" && !this.state.is_email_valid) {
      return (
        <div style={{ color: "red" }}>Please enter a valid email address.</div>
      );
    }
  }

  render() {
    return (
      <Modal show={true} onHide={this.hide_forgot_password}>
        <Modal.Body>
          <div>
            <h4>
              <Icon name="unlock-alt" /> Forgot Password?
            </h4>
            Enter your email address to reset your password
          </div>
          <form onSubmit={this.forgot_password} style={{ marginTop: "1em" }}>
            <FormGroup>
              <FormControl
                ref="email"
                type="email"
                placeholder="Email address"
                name="email"
                autoFocus={true}
                value={this.state.email_address}
                onChange={this.set_email}
              />
            </FormGroup>
            {this.props.forgot_password_error
              ? this.render_error()
              : this.render_success()}
            {this.render_valid_message()}
            <hr />
            Not working? Email us at <HelpEmailLink />.
            <Row>
              <div style={{ textAlign: "right", paddingRight: 15 }}>
                <Button
                  disabled={!this.state.is_email_valid}
                  type="submit"
                  bsStyle="primary"
                  style={{ marginRight: 10 }}
                >
                  Reset Password
                </Button>
                <Button onClick={this.hide_forgot_password}>Close</Button>
              </div>
            </Row>
          </form>
        </Modal.Body>
      </Modal>
    );
  }
}
