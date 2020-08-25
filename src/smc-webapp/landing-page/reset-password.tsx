/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Password reset modal dialog
*/

import { React, ReactDOM, redux, Rendered } from "../app-framework";
import { HelpEmailLink } from "../customize";
import { Modal, FormGroup, FormControl, Row, Button } from "../antd-bootstrap";
import { Space, Loading } from "../r_misc";
import { unreachable } from "smc-util/misc2";

interface Props {
  reset_key: string;
  reset_password_error?: string;
  help_email?: string;
}

type Mode = "start" | "resetting" | "error";

export const ResetPassword: React.FC<Props> = (props: Props) => {
  const { reset_key, reset_password_error, help_email } = props;
  const [mode, set_mode] = React.useState<Mode>("start");
  const ref_password = React.useRef(null);

  React.useEffect(() => {
    // if there is an error, go back to start state
    if (reset_password_error) {
      set_mode("error");
    }
  }, [reset_password_error]);

  async function reset_password(e): Promise<void> {
    e.preventDefault();
    set_mode("resetting");
    const newpw = ReactDOM.findDOMNode(ref_password.current)?.value;
    await redux.getActions("account").reset_password(reset_key, newpw);
  }

  function hide_reset_password(e): void {
    e.preventDefault();
    history.pushState("", document.title, window.location.pathname);
    redux.getActions("account").setState({
      reset_key: "",
      reset_password_error: "",
    });
  }

  function display_error(): Rendered {
    if (reset_password_error) {
      return (
        <span style={{ color: "white", background: "red", padding: "5px" }}>
          {reset_password_error}
        </span>
      );
    }
  }

  function render_email(): Rendered {
    if (!help_email) return;
    return (
      <div style={{ marginBottom: "10px" }}>
        Not working? Email us at <HelpEmailLink />
      </div>
    );
  }

  function render_title(): Rendered {
    switch (mode) {
      case "start":
        return <h1>New Password</h1>;
      case "resetting":
        return <h1>Resetting Password...</h1>;
      case "error":
        return <h1>Problem resetting password...</h1>;
      default:
        unreachable(mode);
        return undefined;
    }
  }

  return (
    <Modal show={true} onHide={() => {}}>
      <Modal.Body>
        <div>
          {render_title()}
          Enter your new password
        </div>
        <br />
        <form onSubmit={(e) => reset_password(e)}>
          <FormGroup>
            <FormControl
              name="password"
              ref={ref_password}
              type="password"
              placeholder="New Password"
            />
          </FormGroup>
          {display_error()}
          <hr />
          {render_email()}
          <Row>
            <div style={{ textAlign: "right", paddingRight: 15 }}>
              <Button onClick={(e) => hide_reset_password(e)}>Cancel</Button>
              <Space />
              <Button
                bsStyle="primary"
                disabled={mode === "resetting"}
                onClick={(e) => reset_password(e)}
              >
                {mode === "resetting" && (
                  <Loading text={""} style={{ display: "inline" }} />
                )}{" "}
                Reset Password
              </Button>
            </div>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
};
