import * as React from "react";
import { ReactDOM, Rendered, redux } from "./app-framework";
import { Passports } from "./passports";
import { List } from "immutable";

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
        ReactDOM.findDOMNode(this.refs.first_name).value,
        ReactDOM.findDOMNode(this.refs.last_name).value,
        ReactDOM.findDOMNode(this.refs.email).value,
        ReactDOM.findDOMNode(this.refs.password).value,
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
          type={"text"}
          placeholder={"Enter the secret token"}
          onChange={e => this.setState({ user_token: e.target.value })}
        />
      </FormGroup>
    );
  }

  render_terms(): Rendered {
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
          maxLength={64}
        />
      </FormGroup>
    );
  }

  render_question() {
    return (
      <>
        <span>What would you like to do with CoCalc? (optional)</span>
        <FormGroup>
          <FormControl
            disabled={!this.state.terms_checkbox}
            name="question"
            ref="question"
            type="text"
            autoFocus={false}
            placeholder="Enter some keywords"
          />
        </FormGroup>
      </>
    );
  }

  render_button(): Rendered {
    return (
      <Button
        style={{ marginBottom: UNIT, marginTop: UNIT }}
        disabled={!this.state.terms_checkbox || this.props.signing_up}
        bsStyle={"success"}
        bsSize={"large"}
        type={"submit"}
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
        {this.render_token_input()}
        {this.render_error("token")}
        {this.render_error("generic")}
        {this.render_error("account_creation_failed")}
        {this.render_passports()}
        <form
          style={{ marginTop: 20, marginBottom: 20 }}
          onSubmit={this.make_account}
        >
          {this.render_first_name()}
          {this.render_last_name()}
          {this.render_email()}
          {this.render_password()}
          {this.render_button()}
        </form>
      </div>
    );
  }

  render(): Rendered {
    const well_style = {
      marginTop: "10px",
      borderColor: COLORS.LANDING.LOGIN_BAR_BG
    };
    return (
      <Well style={well_style}>
        <AccountCreationEmailInstructions />
        {this.render_terms()}
        {this.render_creation_form()}
        <div style={{ textAlign: "center" }}>
          Email <HelpEmailLink /> if you need help.
        </div>
      </Well>
    );
  }
}
