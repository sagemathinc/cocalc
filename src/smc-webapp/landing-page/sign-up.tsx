/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { ReactDOM, Rendered, redux } from "../app-framework";
import { Passports } from "../passports";
import { PassportStrategy } from "../account/passport-types";
import { List } from "immutable";

import { COLORS, UNIT, Icon, Loading } from "../r_misc";

const {
  HelpEmailLink,
  TermsOfService,
  AccountCreationEmailInstructions,
} = require("../customize");

const {
  Button,
  Checkbox,
  FormControl,
  FormGroup,
  Well,
} = require("react-bootstrap");

const ERROR_STYLE: React.CSSProperties = {
  color: "white",
  fontSize: "125%",
  backgroundColor: "red",
  border: "1px solid lightgray",
  padding: "15px",
  marginTop: "5px",
  marginBottom: "5px",
};

export const WELL_STYLE: React.CSSProperties = {
  marginTop: "10px",
  borderColor: COLORS.LANDING.LOGIN_BAR_BG,
};

interface Props {
  strategies?: List<PassportStrategy>;
  email_signup?: boolean;
  get_api_key?: string;
  sign_up_error?: any;
  token?: boolean;
  has_account?: boolean;
  signing_up?: boolean;
  style?: React.CSSProperties;
  has_remember_me?: boolean;
  help_email?: string;
  terms_of_service?: string;
  terms_of_service_url?: string;
}

interface State {
  terms_checkbox: boolean;
  user_token: string;
  show_terms: boolean;
}

export class SignUp extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    const show_terms =
      props.terms_of_service?.length > 0 ||
      props.terms_of_service_url?.length > 0;
    this.state = {
      show_terms,
      terms_checkbox: !show_terms,
      user_token: "",
    };
  }

  make_account = (e) => {
    e.preventDefault();
    return redux
      .getActions("account")
      .create_account(
        ReactDOM.findDOMNode(this.refs.first_name)?.value,
        ReactDOM.findDOMNode(this.refs.last_name)?.value,
        ReactDOM.findDOMNode(this.refs.email)?.value,
        ReactDOM.findDOMNode(this.refs.password)?.value,
        this.state.user_token
      );
  };

  render_error(field): Rendered {
    const err =
      this.props.sign_up_error != undefined
        ? this.props.sign_up_error.get(field)
        : undefined;
    if (err != undefined) {
      return <div style={ERROR_STYLE}>{err}</div>;
    }
  }

  render_passports(): Rendered {
    if (this.props.strategies == undefined) {
      return <Loading />;
    }
    if (this.props.strategies.size <= 1) {
      return;
    }
    return (
      <div>
        <Passports
          strategies={this.props.strategies}
          get_api_key={this.props.get_api_key}
          style={{ textAlign: "center" }}
          disabled={!this.state.terms_checkbox}
        />
        <hr style={{ marginTop: 10, marginBottom: 10 }} />
        Or sign up via email
        <br />
      </div>
    );
  }

  render_token_input(): Rendered {
    if (!this.props.token) {
      return;
    }
    return (
      <FormGroup>
        <FormControl
          disabled={!this.state.terms_checkbox}
          type={"text"}
          placeholder={"Enter secret token"}
          cocalc-test={"sign-up-token"}
          onChange={(e) => this.setState({ user_token: e.target.value })}
        />
      </FormGroup>
    );
  }

  render_terms(): Rendered {
    if (!this.state.show_terms) return undefined;
    return (
      <FormGroup style={{ fontSize: "12pt", margin: "20px" }}>
        <Checkbox
          cocalc-test={"sign-up-tos"}
          onChange={(e) => this.setState({ terms_checkbox: e.target.checked })}
        >
          <TermsOfService />
        </Checkbox>
      </FormGroup>
    );
  }

  render_first_name(): Rendered {
    return (
      <FormGroup>
        {this.render_error("first_name")}
        <FormControl
          disabled={!this.state.terms_checkbox}
          name="first_name"
          ref="first_name"
          type="text"
          autoFocus={false}
          placeholder="First name"
          cocalc-test={"sign-up-first-name"}
          maxLength={120}
        />
      </FormGroup>
    );
  }

  render_last_name(): Rendered {
    return (
      <FormGroup>
        {this.render_error("last_name")}
        <FormControl
          disabled={!this.state.terms_checkbox}
          name="last_name"
          ref="last_name"
          type="text"
          autoFocus={false}
          placeholder="Last name"
          cocalc-test={"sign-up-last-name"}
          maxLength={120}
        />
      </FormGroup>
    );
  }

  render_email(): Rendered {
    return (
      <FormGroup>
        {this.render_error("email_address")}
        <FormControl
          disabled={!this.state.terms_checkbox}
          name="email"
          ref="email"
          type="email"
          placeholder="Email address"
          cocalc-test={"sign-up-email"}
          maxLength={254}
        />
      </FormGroup>
    );
  }

  render_password(): Rendered {
    return (
      <FormGroup>
        {this.render_error("password")}
        <FormControl
          disabled={!this.state.terms_checkbox}
          name="password"
          ref="password"
          type="password"
          placeholder="Choose a password"
          cocalc-test={"sign-up-password"}
          maxLength={64}
        />
      </FormGroup>
    );
  }

  question_blur() {
    const question: string = ReactDOM.findDOMNode(this.refs.question)?.value;
    if (!question) return;
    try {
      // We store the question in localStorage.
      // It can get saved to the backend (associated
      // with their account) once they have signed in
      // or created an account in some way.
      localStorage.sign_up_how_find_cocalc = question;
    } catch (err) {
      // silently fail -- only for analytics.
    }
  }

  render_question() {
    /*
    return (
      <>
        <div style={{ marginBottom: "5px" }}>
          'Where did you find out about CoCalc? '(optional)
        </div>
        <FormGroup>
          <FormControl
            name="question"
            ref="question"
            type="text"
            autoFocus={false}
            onBlur={this.question_blur.bind(this)}
          />
        </FormGroup>
      </>
    );
    */
  }

  render_button(): Rendered {
    return (
      <Button
        style={{ marginBottom: UNIT, marginTop: UNIT }}
        disabled={!this.state.terms_checkbox || this.props.signing_up}
        bsStyle={"success"}
        bsSize={"large"}
        type={"submit"}
        cocalc-test={"sign-up-submit"}
        block
      >
        {this.props.signing_up ? <Icon name="spinner" spin /> : undefined} Sign
        Up!
      </Button>
    );
  }

  render_creation_form(): Rendered {
    return (
      <div>
        {this.render_error("generic")}
        {this.render_error("account_creation_failed")}
        {this.render_error("other")}
        {this.render_passports()}
        {this.props.email_signup && (
          <form
            style={{ marginTop: 20, marginBottom: 20 }}
            onSubmit={this.make_account}
          >
            {this.render_error("token")}
            {this.render_token_input()}
            {this.render_first_name()}
            {this.render_last_name()}
            {this.render_email()}
            {this.render_password()}
            {this.render_button()}
          </form>
        )}
      </div>
    );
  }

  render(): Rendered {
    return (
      <Well style={WELL_STYLE}>
        <AccountCreationEmailInstructions />
        {this.render_question()}
        {this.render_terms()}
        {this.render_creation_form()}
        {!!this.props.help_email ? (
          <div style={{ textAlign: "center" }}>
            Email <HelpEmailLink /> if you need help.
          </div>
        ) : undefined}
      </Well>
    );
  }
}
