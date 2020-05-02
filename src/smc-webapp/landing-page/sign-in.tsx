/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { ReactDOM, Rendered } from "../app-framework";
import { List } from "immutable";
import { ErrorDisplay } from "../r_misc/error-display";
import { Markdown } from "../r_misc";
import { Passports } from "../passports";
import {
  Col,
  Row,
  FormGroup,
  FormControl,
  Button,
  Grid,
} from "react-bootstrap";
import { bind_methods } from "smc-util/misc2";

import { actions } from "./util";

interface Props {
  sign_in_error?: string;
  signing_in?: boolean;
  has_account?: boolean;
  xs?: boolean; // extra small
  color: string;
  strategies?: List<string>;
  get_api_key?: string;
}

interface State {
  show_forgot_password: boolean;
}

export class SignIn extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { show_forgot_password: false };
    bind_methods(this, [
      "remove_error",
      "sign_in",
      "display_forgot_password",
      "change_email",
    ]);
  }
  componentDidMount(): void {
    actions("page").set_sign_in_func(this.sign_in);
  }

  componentWillUnmount(): void {
    actions("page").remove_sign_in_func();
  }

  sign_in(e): void {
    if (e != null) {
      e.preventDefault();
    }
    actions("account").sign_in(
      ReactDOM.findDOMNode(this.refs.email).value,
      ReactDOM.findDOMNode(this.refs.password).value
    );
  }

  display_forgot_password(): void {
    actions("account").setState({ show_forgot_password: true });
  }

  render_error(): Rendered {
    if (!this.props.sign_in_error) return;
    // TODO: @j3 -- please fix ErrorDisplay typing so the conversion
    // to unknown below is not needed.
    return (
      <ErrorDisplay
        style={{ marginRight: 0 }}
        error_component={<Markdown value={this.props.sign_in_error} />}
        onClose={() =>
          actions("account").setState({ sign_in_error: undefined })
        }
      />
    );
  }

  render_passports(): Rendered {
    return (
      <div>
        <Passports
          strategies={this.props.strategies}
          get_api_key={this.props.get_api_key}
          no_heading={true}
        />
      </div>
    );
  }

  remove_error(): void {
    if (this.props.sign_in_error) {
      actions("account").setState({ sign_in_error: undefined });
    }
  }

  change_email(): void {
    actions("account").setState({
      sign_in_error: undefined,
      sign_in_email_address: ReactDOM.findDOMNode(this.refs.email).value,
    });
  }

  forgot_font_size(): string {
    if (this.props.sign_in_error != null) {
      return "16pt";
    } else {
      return "12pt";
    }
  }

  render_extra_small(): Rendered {
    return (
      <Col xs={12}>
        <form onSubmit={this.sign_in} className="form-inline">
          <Row>
            <FormGroup>
              <FormControl
                ref="email"
                type="email"
                placeholder="Email address"
                name="email"
                autoFocus={this.props.has_account}
                onChange={this.change_email}
              />
            </FormGroup>
          </Row>
          <Row>
            <FormGroup>
              <FormControl
                style={{ width: "100%" }}
                ref="password"
                type="password"
                name="password"
                placeholder="Password"
                onChange={this.remove_error}
              />
            </FormGroup>
          </Row>
          <Row>
            <div style={{ marginTop: "1ex" }}>
              <a
                onClick={this.display_forgot_password}
                style={{
                  color: this.props.color,
                  cursor: "pointer",
                  fontSize: this.forgot_font_size(),
                }}
              >
                Forgot Password?
              </a>
            </div>
          </Row>
          <Row>
            <Button
              type="submit"
              disabled={this.props.signing_in}
              bsStyle="default"
              style={{ height: 34 }}
              className="pull-right"
            >
              Sign&nbsp;In
            </Button>
          </Row>
          <Row>{this.render_passports()}</Row>
          <Row className="form-inline pull-right" style={{ clear: "right" }}>
            {this.render_error()}
          </Row>
        </form>
      </Col>
    );
  }

  render_full_size(): Rendered {
    return (
      <form onSubmit={this.sign_in} className="form-inline">
        <Grid fluid={true} style={{ padding: 0 }}>
          <Row>
            <Col xs={5}>
              <FormGroup>
                <FormControl
                  style={{ width: "100%" }}
                  ref="email"
                  type="email"
                  name="email"
                  placeholder="Email address"
                  cocalc-test={"sign-in-email"}
                  autoFocus={true}
                  onChange={this.change_email}
                />
              </FormGroup>
            </Col>
            <Col xs={4}>
              <FormGroup>
                <FormControl
                  style={{ width: "100%" }}
                  ref="password"
                  type="password"
                  name="password"
                  placeholder="Password"
                  cocalc-test={"sign-in-password"}
                  onChange={this.remove_error}
                />
              </FormGroup>
            </Col>
            <Col xs={3}>
              <Button
                cocalc-test={"sign-in-submit"}
                type="submit"
                disabled={this.props.signing_in}
                bsStyle="default"
                style={{ height: 34 }}
                className="pull-right"
              >
                Sign&nbsp;in
              </Button>
            </Col>
          </Row>
          <Row>
            <Col xs={7} xsOffset={5} style={{ paddingLeft: 15 }}>
              <div style={{ marginTop: "1ex" }}>
                <a
                  onClick={this.display_forgot_password}
                  style={{
                    color: this.props.color,
                    cursor: "pointer",
                    fontSize: this.forgot_font_size(),
                  }}
                >
                  Forgot Password?
                </a>
              </div>
            </Col>
          </Row>
          <Row>
            <Col xs={12}>{this.render_passports()}</Col>
          </Row>
          <Row
            className={"form-inline pull-right"}
            style={{ clear: "right", width: "100%" }}
          >
            <Col xs={12}>{this.render_error()}</Col>
          </Row>
        </Grid>
      </form>
    );
  }

  render(): Rendered {
    if (this.props.xs) {
      return this.render_extra_small();
    } else {
      return this.render_full_size();
    }
  }
}
