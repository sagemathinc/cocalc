import * as React from "react";
import { Passports } from "./passports";
import { List } from "immutable";
import { redux } from "./app-framework";

const { COLORS, UNIT, Icon, Loading } = require("./r_misc");
const {
  HelpEmailLink,
  TermsOfService,
  AccountCreationEmailInstructions
} = require("./customize");
const {
  Button,
  Checkbox,
  FormControl,
  FormGroup,
  Well
} = require("react-bootstrap");

const ERROR_STYLE: React.CSSProperties = {
  color: "white",
  fontSize: "125%",
  backgroundColor: "red",
  border: "1px solid lightgray",
  padding: "15px",
  marginTop: "5px",
  marginBottom: "5px"
};

interface Props {
  strategies: List<string>;
  get_api_key: string;
  sign_up_error: any;
  token: boolean;
  has_account: boolean;
  signing_up: boolean;
  style: React.CSSProperties;
  has_remember_me: boolean;
}

interface State {
  terms_checkbox: boolean;
  user_token: string;
}

export class SignUp extends React.Component<Props, State> {
  private first_name_ref: any;
  private last_name_ref: any;
  private email_ref: any;
  private password_ref: any;

  constructor(props) {
    super(props);

    this.state = {
      terms_checkbox: false,
      user_token: ""
    };
  }

  make_account = e => {
    e.preventDefault();
    return redux
      .getActions("account")
      .create_account(
        this.first_name_ref.value,
        this.last_name_ref.value,
        this.email_ref.value,
        this.password_ref.value,
        this.state.user_token
      );
  };

  render_error(field) {
    const err =
      this.props.sign_up_error != undefined
        ? this.props.sign_up_error.get(field)
        : undefined;
    if (err != undefined) {
      return <div style={ERROR_STYLE}>{err}</div>;
    }
  }

  render_passports() {
    if (this.props.strategies == undefined) {
      return <Loading />;
    }
    if (this.props.strategies.size > 1) {
      return (
        <div>
          <Passports
            strategies={this.props.strategies}
            get_api_key={this.props.get_api_key}
            style={{ textAlign: "center" }}
          />
          Or sign up via email
          <br />
        </div>
      );
    }
  }

  render_token_input() {
    if (this.props.token) {
      return (
        <FormGroup>
          <FormControl
            type={"text"}
            placeholder={"Enter the secret token"}
            onChange={e => this.setState({ user_token: e.target.value })}
          />
        </FormGroup>
      );
    }
  }

  render_terms() {
    return (
      <FormGroup style={{ fontSize: "12pt", margin: "20px" }}>
        <Checkbox
          onChange={e => this.setState({ terms_checkbox: e.target.checked })}
        >
          <TermsOfService />
        </Checkbox>
      </FormGroup>
    );
  }

  render_creation_form() {
    return (
      <div>
        {this.render_token_input()}
        {this.render_error("token")}
        {this.render_error("generic")}
        {this.render_error("account_creation_failed")}
        {this.state.terms_checkbox ? this.render_passports() : undefined}
        <form
          style={{ marginTop: 20, marginBottom: 20 }}
          onSubmit={this.make_account}
        >
          <FormGroup>
            {this.render_error("first_name")}
            <FormControl
              inputRef={ref => {
                this.first_name_ref = ref;
              }}
              type="text"
              autoFocus={false}
              placeholder="First name"
              maxLength={120}
            />
          </FormGroup>
          <FormGroup>
            {this.render_error("last_name")}
            <FormControl
              inputRef={ref => {
                this.last_name_ref = ref;
              }}
              type="text"
              autoFocus={false}
              placeholder="Last name"
              maxLength={120}
            />
          </FormGroup>
          <FormGroup>
            {this.render_error("email_address")}
            <FormControl
              inputRef={ref => {
                this.email_ref = ref;
              }}
              type="email"
              placeholder="Email address"
              maxLength={254}
            />
          </FormGroup>
          <FormGroup>
            {this.render_error("password")}
            <FormControl
              inputRef={ref => {
                this.password_ref = ref;
              }}
              type="password"
              placeholder="Choose a password"
              maxLength={64}
            />
          </FormGroup>
          <Button
            style={{ marginBottom: UNIT, marginTop: UNIT }}
            disabled={this.props.signing_up}
            bsStyle={"success"}
            bsSize={"large"}
            type={"submit"}
            block
          >
            {this.props.signing_up ? <Icon name="spinner" spin /> : undefined}{" "}
            Sign Up!
          </Button>
        </form>
      </div>
    );
  }

  render() {
    const well_style = {
      marginTop: "10px",
      borderColor: COLORS.LANDING.LOGIN_BAR_BG
    };
    return (
      <Well style={well_style}>
        <AccountCreationEmailInstructions />
        {this.render_terms()}
        {this.state.terms_checkbox ? this.render_creation_form() : undefined}
        <div style={{ textAlign: "center" }}>
          Email <HelpEmailLink /> if you need help.
        </div>
      </Well>
    );
  }
}
