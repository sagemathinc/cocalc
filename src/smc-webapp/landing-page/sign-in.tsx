/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useEffect, useState } from "../app-framework";
import { List } from "immutable";
import { ErrorDisplay } from "../r_misc/error-display";
import { Markdown } from "../r_misc";
import { Passports } from "../passports";
import { PassportStrategy } from "../account/passport-types";
import { Col, Row, Button } from "../antd-bootstrap";
import { Input } from "antd";

interface Props {
  sign_in_error?: string;
  signing_in?: boolean;
  has_account?: boolean;
  xs?: boolean; // extra small
  color: string;
  strategies?: List<PassportStrategy>;
  get_api_key?: string;
}

export const SignIn: React.FC<Props> = (props) => {
  const page_actions = useActions("page");
  useEffect(() => {
    page_actions.set_sign_in_func(sign_in);
    return () => page_actions.remove_sign_in_func();
  }, []);

  const actions = useActions("account");

  const [email, set_email] = useState<string>("");
  const [password, set_password] = useState<string>("");

  // Just a quick check for whether submit button should be disabled
  // don't make too clever, since we want user to see errors.
  function is_submittable(): boolean {
    return email != "" && password != "" && !props.signing_in;
  }

  function sign_in(): void {
    actions.sign_in(email, password);
  }

  function display_forgot_password(): void {
    actions.setState({ show_forgot_password: true });
  }

  function render_error(): JSX.Element | undefined {
    if (!props.sign_in_error) return;
    // TODO: please fix ErrorDisplay typing so the conversion
    // to unknown below is not needed.
    return (
      <ErrorDisplay
        style={{ marginRight: 0 }}
        error_component={<Markdown value={props.sign_in_error} />}
        onClose={() => actions.setState({ sign_in_error: undefined })}
      />
    );
  }

  function render_passports(): JSX.Element {
    return (
      <div>
        <Passports
          strategies={props.strategies}
          get_api_key={props.get_api_key}
          no_heading={true}
        />
      </div>
    );
  }

  function remove_error(): void {
    if (props.sign_in_error) {
      actions.setState({ sign_in_error: undefined });
    }
  }

  function forgot_font_size(): string {
    if (props.sign_in_error != null) {
      return "16pt";
    } else {
      return "12pt";
    }
  }

  function render_full_size(): JSX.Element {
    return (
      <div>
        <Row>
          <Col md={5} xs={12}>
            <Input
              style={{ width: "100%", marginBottom: "5px" }}
              value={email}
              type="email"
              name="email"
              placeholder="Email address"
              cocalc-test={"sign-in-email"}
              autoFocus={true}
              onChange={(e) => {
                const sign_in_email_address = e.target.value;
                set_email(sign_in_email_address);
                actions.setState({
                  sign_in_email_address, // so can be used by modal password reset dialog...
                  sign_in_error: undefined,
                });
              }}
            />
          </Col>
          <Col md={5} xs={12}>
            <Input.Password
              placeholder="Password"
              style={{ width: "100%", marginBottom: "5px" }}
              value={password}
              type="password"
              name="password"
              cocalc-test={"sign-in-password"}
              onChange={(e) => {
                set_password(e.target.value);
                remove_error();
              }}
              onKeyDown={(e) => {
                if (e.keyCode == 13) {
                  e.preventDefault();
                  sign_in();
                }
              }}
            />
          </Col>
          <Col md={2} xs={12}>
            <Button
              cocalc-test={"sign-in-submit"}
              disabled={!is_submittable()}
              style={{ height: 34 }}
              className="pull-right"
              onClick={sign_in}
            >
              Sign&nbsp;in
            </Button>
          </Col>
        </Row>
        <Row>
          <Col xs={7} xsOffset={5} style={{ paddingLeft: 15 }}>
            <div style={{ marginTop: "1ex" }}>
              <a
                onClick={display_forgot_password}
                style={{
                  color: props.color,
                  cursor: "pointer",
                  fontSize: forgot_font_size(),
                }}
              >
                Forgot Password?
              </a>
            </div>
          </Col>
        </Row>
        <Row>
          <Col xs={12}>{render_passports()}</Col>
        </Row>
        <Row
          className={"form-inline pull-right"}
          style={{ clear: "right", width: "100%" }}
        >
          <Col xs={12}>{render_error()}</Col>
        </Row>
      </div>
    );
  }

  return render_full_size();
  /*
  if (props.xs) {
    return render_extra_small();
  } else {
    return render_full_size();
  }
  */
};
