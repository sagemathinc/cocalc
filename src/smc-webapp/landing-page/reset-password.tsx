/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Password reset modal dialog
*/

import { Component, React, ReactDOM, redux, Rendered } from "../app-framework";

import { HelpEmailLink } from "../customize";

import { Modal, FormGroup, FormControl, Row, Button } from "../antd-bootstrap";

import { Space } from "../r_misc";

interface Props {
  reset_key: string;
  reset_password_error?: string;
  help_email?: string;
}

interface State {
  resetting: boolean;
}

export class ResetPassword extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { resetting: false };
  }

  private async reset_password(e): Promise<void> {
    e.preventDefault();
    this.setState({ resetting: true });
    await redux
      .getActions("account")
      .reset_password(
        this.props.reset_key,
        ReactDOM.findDOMNode(this.refs.password).value
      );
    this.setState({ resetting: false });
  }

  private hide_reset_password(e): void {
    e.preventDefault();
    history.pushState("", document.title, window.location.pathname);
    redux.getActions("account").setState({
      reset_key: "",
      reset_password_error: "",
    });
  }

  private display_error(): Rendered {
    if (this.props.reset_password_error) {
      return (
        <span style={{ color: "white", background: "red", padding: "5px" }}>
          {this.props.reset_password_error}
        </span>
      );
    }
  }

  private render_email(): Rendered {
    if (!this.props.help_email) return;
    return (
      <>
        Not working? Email us at <HelpEmailLink />
      </>
    );
  }

  private render_title(): Rendered {
    if (this.state.resetting) {
      return <h1>Resetting Password...</h1>;
    } else {
      return <h1>Reset Password?</h1>;
    }
  }

  public render(): Rendered {
    return (
      <Modal show={true} onHide={() => {}}>
        <Modal.Body>
          <div>
            {this.render_title()}
            Enter your new password
          </div>
          <br />
          <form onSubmit={this.reset_password.bind(this)}>
            <FormGroup>
              <FormControl
                name="password"
                ref="password"
                type="password"
                placeholder="New Password"
              />
            </FormGroup>
            {this.display_error()}
            <hr />
            {this.render_email()}
            <Row>
              <div style={{ textAlign: "right", paddingRight: 15 }}>
                <Button onClick={this.hide_reset_password.bind(this)}>
                  Cancel
                </Button>
                <Space />
                <Button
                  bsStyle="primary"
                  disabled={this.state.resetting}
                  onClick={this.reset_password.bind(this)}
                >
                  Reset Password
                </Button>
              </div>
            </Row>
          </form>
        </Modal.Body>
      </Modal>
    );
  }
}
