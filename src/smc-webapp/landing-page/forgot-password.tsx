/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Dialog that is displayed when a person forgets their password
   and requests a reset.
*/

import * as React from "react";
import { Row, FormGroup, FormControl, Modal, Button } from "react-bootstrap";
import { is_valid_email_address } from "smc-util/misc";
import { Rendered } from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { Icon, Loading } from "../r_misc";
import { actions } from "./util";

interface Props {
  initial_email_address: string;
  forgot_password_error?: string;
  forgot_password_success?: string;
}

type Mode = "init" | "resetting" | "error" | "sent";

export const ForgotPassword: React.FC<Props> = (props: Props) => {
  const {
    initial_email_address,
    forgot_password_error,
    forgot_password_success,
  } = props;
  const [email_address, set_email_address] = React.useState<string>(
    initial_email_address
  );
  const [is_email_valid, set_is_email_valid] = React.useState<boolean>(
    is_valid_email_address(initial_email_address)
  );
  const [mode, set_mode] = React.useState<Mode>("init");

  React.useEffect(() => {
    if (forgot_password_error) {
      set_mode("error");
    } else if (forgot_password_success) {
      set_mode("sent");
    }
  }, [forgot_password_success, forgot_password_error]);

  async function forgot_password(e): Promise<void> {
    e.preventDefault();
    const value = email_address;
    set_mode("resetting");
    if (is_valid_email_address(value)) {
      await actions("account").forgot_password(value);
    }
  }

  function set_email(evt): void {
    const email_address = evt.target.value;
    set_email_address(email_address);
    set_is_email_valid(is_valid_email_address(email_address));
  }

  function hide_forgot_password(): void {
    const a = actions("account");
    a.setState({ show_forgot_password: false });
    a.setState({ forgot_password_error: undefined });
    a.setState({ forgot_password_success: undefined });
  }

  function render_error(): Rendered {
    if (forgot_password_error == null) return;
    return <span style={{ color: "red" }}>{forgot_password_error}</span>;
  }

  function render_success(): Rendered {
    if (forgot_password_success == null) return;
    const s = forgot_password_success.split("check your spam folder");
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

  function render_valid_message(): Rendered {
    if (email_address != "" && !is_email_valid) {
      return (
        <div style={{ color: "red" }}>Please enter a valid email address.</div>
      );
    }
  }

  const disabled = ["resetting", "sent"].includes(mode);

  return (
    <Modal show={true} onHide={hide_forgot_password}>
      <Modal.Body>
        <div>
          <h4>
            <Icon name="unlock-alt" /> Forgot Password?
          </h4>
          Enter your email address to reset your password
        </div>
        <form onSubmit={forgot_password} style={{ marginTop: "1em" }}>
          <FormGroup>
            <FormControl
              type="email"
              placeholder="Email address"
              name="email"
              disabled={disabled}
              autoFocus={true}
              value={email_address}
              onChange={(e) => set_email(e)}
            />
          </FormGroup>
          {forgot_password_error ? render_error() : render_success()}
          {render_valid_message()}
          <hr />
          Not working? Email us at <HelpEmailLink />.
          <Row>
            <div style={{ textAlign: "right", paddingRight: 15 }}>
              <Button
                disabled={!is_email_valid || disabled}
                type="submit"
                bsStyle="primary"
                style={{ marginRight: 10 }}
              >
                {mode === "resetting" && (
                  <Loading style={{ display: "inline" }} text={""} />
                )}{" "}
                Reset Password
              </Button>
              <Button onClick={() => hide_forgot_password()}>Close</Button>
            </div>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
};
