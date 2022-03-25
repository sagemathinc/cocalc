/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PassportStrategyFrontend } from "@cocalc/frontend/account/passport-types";
import {
  ReactDOM,
  redux,
  Rendered,
  TypedMap,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, UNIT } from "@cocalc/frontend/components";
import {
  AccountCreationEmailInstructions,
  HelpEmailLink,
  TermsOfService,
} from "@cocalc/frontend/customize";
//import { set_local_storage } from "@cocalc/frontend/misc";
import { Passports, PassportStrategy } from "@cocalc/frontend/passports";
import { COLORS } from "@cocalc/util/theme";
import { List } from "immutable";
import React from "react";

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
  strategies?: List<TypedMap<PassportStrategyFrontend>>;
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
  exclusive_sso_domains?: { [domain: string]: string };
}

export const SignUp: React.FC<Props> = (props: Props) => {
  const {
    strategies,
    email_signup,
    get_api_key,
    sign_up_error,
    token,
    // has_account,
    signing_up,
    // style,
    // has_remember_me,
    help_email,
    terms_of_service,
    terms_of_service_url,
    exclusive_sso_domains = {},
  } = props;

  const show_terms =
    (terms_of_service?.length ?? 0) > 0 ||
    (terms_of_service_url?.length ?? 0) > 0;

  const [terms_checkbox, set_terms_checkbox] = useState<boolean>(!show_terms);
  const [user_token, set_user_token] = useState<string>("");
  const [domain_blocked, set_domain_blocked] = useState<string | undefined>();

  const first_name_ref = useRef<HTMLInputElement>();
  const last_name_ref = useRef<HTMLInputElement>();
  const email_ref = useRef<HTMLInputElement>();
  const password_ref = useRef<HTMLInputElement>();

  function make_account(e) {
    e.preventDefault();
    return redux
      .getActions("account")
      .create_account(
        ReactDOM.findDOMNode(first_name_ref.current)?.value,
        ReactDOM.findDOMNode(last_name_ref.current)?.value,
        ReactDOM.findDOMNode(email_ref.current)?.value,
        ReactDOM.findDOMNode(password_ref.current)?.value,
        user_token
      );
  }

  function render_error(field): Rendered {
    const err =
      sign_up_error != undefined ? sign_up_error.get(field) : undefined;
    if (err != undefined) {
      return <div style={ERROR_STYLE}>{err}</div>;
    }
  }

  function render_passports(): Rendered {
    if (strategies == undefined) {
      return <Loading />;
    }
    if (strategies.size <= 1) {
      return;
    }
    return (
      <div>
        <Passports
          strategies={strategies}
          get_api_key={get_api_key}
          style={{ textAlign: "center" }}
          disabled={!terms_checkbox}
        />
        <hr style={{ marginTop: 10, marginBottom: 10 }} />
        Or sign up via email
        <br />
      </div>
    );
  }

  function render_token_input(): Rendered {
    if (!token) {
      return;
    }
    return (
      <FormGroup>
        <FormControl
          disabled={!terms_checkbox}
          type={"text"}
          placeholder={"Enter secret token"}
          cocalc-test={"sign-up-token"}
          onChange={(e) => set_user_token(e.target.value)}
        />
      </FormGroup>
    );
  }

  function render_terms(): Rendered {
    if (!show_terms) return undefined;
    return (
      <FormGroup style={{ fontSize: "12pt", margin: "20px" }}>
        <Checkbox
          cocalc-test={"sign-up-tos"}
          onChange={(e) => set_terms_checkbox(e.target.checked)}
        >
          <TermsOfService />
        </Checkbox>
      </FormGroup>
    );
  }

  function render_first_name(): Rendered {
    return (
      <FormGroup>
        {render_error("first_name")}
        <FormControl
          disabled={!terms_checkbox}
          name="first_name"
          ref={first_name_ref}
          type="text"
          autoFocus={false}
          placeholder="First name"
          cocalc-test={"sign-up-first-name"}
          maxLength={120}
        />
      </FormGroup>
    );
  }

  function render_last_name(): Rendered {
    return (
      <FormGroup>
        {render_error("last_name")}
        <FormControl
          disabled={!terms_checkbox}
          name="last_name"
          ref={last_name_ref}
          type="text"
          autoFocus={false}
          placeholder="Last name"
          cocalc-test={"sign-up-last-name"}
          maxLength={120}
        />
      </FormGroup>
    );
  }

  function check_email(email: string) {
    // this is just a quick heuristic – a full check is done in the hub
    const domain = email.split("@")[1]?.trim().toLowerCase();
    if (domain != null && exclusive_sso_domains[domain] != null) {
      set_domain_blocked(domain);
    } else if (domain_blocked != null) {
      set_domain_blocked(undefined);
    }
  }

  function render_exclusive_sso() {
    if (domain_blocked == null) return;
    const name = exclusive_sso_domains[domain_blocked];
    const strategy = strategies?.find((s) => s.get("name") == name);
    if (strategy != null) {
      return (
        <div style={{ textAlign: "center" }}>
          <PassportStrategy strategy={strategy.toJS()} />
        </div>
      );
    } else {
      return { name };
    }
  }

  function render_domain_blocked(): Rendered {
    if (domain_blocked == null) return;
    return (
      <div style={ERROR_STYLE}>
        To sign up with{" "}
        <code style={{ color: "white" }}>@{domain_blocked}</code>, you have to
        use the corresponding SSO connect mechanism:
        {render_exclusive_sso()}
      </div>
    );
  }

  function render_email(): Rendered {
    return (
      <FormGroup>
        {render_error("email_address")}
        {render_domain_blocked()}
        <FormControl
          disabled={!terms_checkbox}
          name="email"
          ref={email_ref}
          type="email"
          placeholder="Email address"
          cocalc-test={"sign-up-email"}
          maxLength={254}
          onChange={(e) => check_email(e.target.value)}
        />
      </FormGroup>
    );
  }

  function render_password(): Rendered {
    return (
      <FormGroup>
        {render_error("password")}
        <FormControl
          disabled={!terms_checkbox}
          name="password"
          ref={password_ref}
          type="password"
          placeholder="Choose a password"
          cocalc-test={"sign-up-password"}
          maxLength={64}
        />
      </FormGroup>
    );
  }

  // function question_blur() {
  //   const question: string = ReactDOM.findDOMNode(questionRef.current)?.value;
  //   if (!question) return;
  //   try {
  //     // We store the question in localStorage.
  //     // It can get saved to the backend (associated
  //     // with their account) once they have signed in
  //     // or created an account in some way.
  //     set_local_storage("sign_up_how_find_cocalc", question);
  //   } catch (err) {
  //     // silently fail -- only for analytics.
  //   }
  // }

  function render_question() {
    /*
    return (
      <>
        <div style={{ marginBottom: "5px" }}>
          'Where did you find out about CoCalc? '(optional)
        </div>
        <FormGroup>
          <FormControl
            name="question"
            ref={questionRef}
            type="text"
            autoFocus={false}
            onBlur={question_blur.bind(this)}
          />
        </FormGroup>
      </>
    );
    */
  }

  function render_button(): Rendered {
    return (
      <Button
        style={{ marginBottom: UNIT, marginTop: UNIT }}
        disabled={!terms_checkbox || signing_up || domain_blocked != null}
        bsStyle={"success"}
        bsSize={"large"}
        type={"submit"}
        cocalc-test={"sign-up-submit"}
        block
      >
        {signing_up ? <Icon name="cocalc-ring" spin /> : undefined} Sign Up!
      </Button>
    );
  }

  function render_creation_form(): Rendered {
    return (
      <div>
        {render_error("generic")}
        {render_error("account_creation_failed")}
        {render_error("other")}
        {render_passports()}
        {email_signup && (
          <form
            style={{ marginTop: 20, marginBottom: 20 }}
            onSubmit={make_account}
          >
            {render_error("token")}
            {render_token_input()}
            {render_first_name()}
            {render_last_name()}
            {render_email()}
            {render_password()}
            {render_button()}
          </form>
        )}
      </div>
    );
  }

  return (
    <Well style={WELL_STYLE}>
      <AccountCreationEmailInstructions />
      {render_question()}
      {render_terms()}
      {render_creation_form()}
      {!!help_email ? (
        <div style={{ textAlign: "center" }}>
          Email <HelpEmailLink /> if you need help.
        </div>
      ) : undefined}
    </Well>
  );
};
