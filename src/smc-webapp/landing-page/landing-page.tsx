/*
The Landing Page
*/

import * as immutable from "immutable";

import {
  Component,
  rclass,
  React,
  redux,
  rtypes,
  Rendered,
} from "../app-framework";

import { Row, Col } from "../antd-bootstrap";

import { UNIT, COLORS } from "../r_misc";

import { SiteDescription, Footer } from "../customize";

import { SignUp } from "./sign-up";
import { SignIn } from "./sign-in";
import { ForgotPassword } from "./forgot-password";
import { ResetPassword } from "./reset-password";
import { Connecting } from "./connecting";

import { QueryParams } from "../misc/query-params";
import { NAME as LAUNCH_ACTIONS_NAME } from "../launch/actions";

const DESC_FONT = "sans-serif";

// import { ShowSupportLink } from "../support";
const { ShowSupportLink } = require("../support");

import { reset_password_key } from "../client/password-reset";
import { capitalize } from "smc-util/misc2";
import { DOC_URL } from "smc-util/theme";
// import { APP_ICON_WHITE, APP_LOGO_NAME_WHITE } from "../art";
const { APP_ICON_WHITE, APP_LOGO_NAME_WHITE } = require("../art");

$.get(window.app_base_url + "/registration", function (obj, status) {
  if (status === "success") {
    return redux.getActions("account").setState({ token: obj.token });
  }
});

interface Props {
  strategies?: immutable.List<string>;
  sign_up_error?: immutable.Map<string, any>;
  sign_in_error?: string;
  signing_in?: boolean;
  signing_up?: boolean;
  forgot_password_error?: string;
  forgot_password_success?: string;
  show_forgot_password?: boolean;
  token?: boolean;
  reset_key?: string;
  reset_password_error?: string;
  remember_me?: boolean;
  has_remember_me?: boolean;
  has_account?: boolean;
}

interface reduxProps {
  get_api_key?: string;

  is_commercial?: boolean;
  _is_configured?: boolean;
  logo_square?: string;
  logo_rectangular?: string;
  help_email?: string;
  terms_of_service?: string;
  terms_of_service_url?: string;

  sign_in_email_address?: string;

  type?: string;
  launch?: string;
}

class LandingPage extends Component<Props & reduxProps> {
  static reduxProps() {
    return {
      page: {
        get_api_key: rtypes.string,
      },
      customize: {
        is_commercial: rtypes.bool,
        _is_configured: rtypes.bool,
        logo_square: rtypes.string,
        logo_rectangular: rtypes.string,
        help_email: rtypes.string,
        terms_of_service: rtypes.string,
        terms_of_service_url: rtypes.string,
      },
      account: {
        sign_in_email_address: rtypes.string,
      },
      [LAUNCH_ACTIONS_NAME]: {
        type: rtypes.string,
        launch: rtypes.string,
      },
    };
  }

  private render_password_reset(): Rendered {
    const reset_key = reset_password_key();
    if (!reset_key) {
      return;
    }
    return (
      <ResetPassword
        reset_key={reset_key}
        reset_password_error={this.props.reset_password_error}
        help_email={this.props.help_email}
      />
    );
  }

  private render_forgot_password(): Rendered {
    if (!this.props.show_forgot_password) {
      return;
    }
    return (
      <ForgotPassword
        initial_email_address={
          this.props.sign_in_email_address != null
            ? this.props.sign_in_email_address
            : ""
        }
        forgot_password_error={this.props.forgot_password_error}
        forgot_password_success={this.props.forgot_password_success}
      />
    );
  }

  private render_support(): Rendered {
    if (!this.props.is_commercial) {
      return;
    }

    return (
      <div>
        Questions? Create a <ShowSupportLink />.
      </div>
    );
  }

  private render_launch_action(): Rendered {
    if (this.props.type == null) {
      return;
    }
    return (
      <Row>
        <h3>
          Launch Action: <code>{this.props.type}</code> for{" "}
          <code>{this.props.launch}</code>
        </h3>
      </Row>
    );
  }

  private render_main_page(): Rendered {
    let main_row_style;
    if (
      (this.props.remember_me || QueryParams.get("auth_token")) &&
      !this.props.get_api_key
    ) {
      // Just assume user will be signing in.
      // CSS of this looks like crap for a moment; worse than nothing. So disabling unless it can be fixed!!
      return <Connecting />;
    }

    const img_icon = !!this.props.logo_square
      ? this.props.logo_square
      : APP_ICON_WHITE;
    const img_name = !!this.props.logo_rectangular
      ? this.props.logo_rectangular
      : APP_LOGO_NAME_WHITE;
    const customized =
      !!this.props.logo_square && !!this.props.logo_rectangular;

    const topbar = {
      img_icon,
      img_name,
      customized,
      img_opacity: 1.0,
      color: customized ? COLORS.GRAY_D : "white",
      bg_color: customized ? COLORS.BLUE_LLL : COLORS.LANDING.LOGIN_BAR_BG,
      border: `5px solid ${COLORS.LANDING.LOGIN_BAR_BG}`,
    };

    main_row_style = {
      fontSize: UNIT,
      backgroundColor: COLORS.LANDING.LOGIN_BAR_BG,
      padding: 5,
      margin: 0,
      borderRadius: 4,
    };

    return (
      <div style={{ margin: UNIT }}>
        {this.render_launch_action()}
        {this.render_password_reset()}
        {this.render_forgot_password()}
        <Row style={main_row_style} className={"visible-xs"}>
          <SignIn
            get_api_key={this.props.get_api_key}
            signing_in={this.props.signing_in}
            sign_in_error={this.props.sign_in_error}
            has_account={this.props.has_account}
            xs={true}
            strategies={this.props.strategies}
            color={topbar.color}
          />
          <div style={{ clear: "both" }}></div>
        </Row>
        <Row
          style={{
            backgroundColor: topbar.bg_color,
            border: topbar.border,
            padding: 5,
            margin: 0,
            marginBottom: 20,
            borderRadius: 5,
            position: "relative",
            whiteSpace: "nowrap",
          }}
          className="hidden-xs"
        >
          <div
            style={{
              width: 490,
              zIndex: 10,
              position: "relative",
              top: UNIT,
              right: UNIT,
              fontSize: "11pt",
              float: "right",
            }}
          >
            <SignIn
              get_api_key={this.props.get_api_key}
              signing_in={this.props.signing_in}
              sign_in_error={this.props.sign_in_error}
              has_account={this.props.has_account}
              xs={false}
              strategies={this.props.strategies}
              color={topbar.color}
            />
          </div>
          {this.props._is_configured ? (
            <div
              style={{
                display: "inline-block",
                backgroundImage: `url('${topbar.img_icon}')`,
                backgroundSize: "contain",
                height: 75,
                width: 75,
                margin: 5,
                verticalAlign: "center",
                backgroundRepeat: "no-repeat",
              }}
            ></div>
          ) : undefined}

          {!topbar.customized ? (
            <div
              className="hidden-sm"
              style={{
                display: "inline-block",
                fontFamily: DESC_FONT,
                fontSize: "28px",
                top: UNIT,
                left: UNIT * 7,
                width: 300,
                height: 75,
                position: "absolute",
                color: topbar.color,
                opacity: topbar.img_opacity,
                backgroundImage: `url('${topbar.img_name}')`,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
              }}
            ></div>
          ) : undefined}
          {topbar.customized ? (
            <img
              className="hidden-sm"
              src={topbar.img_name}
              style={{
                display: "inline-block",
                top: UNIT,
                left: UNIT * 7,
                width: "auto",
                height: 50,
                position: "absolute",
                color: topbar.color,
                opacity: topbar.img_opacity,
              }}
            />
          ) : undefined}

          <div className="hidden-sm">
            <SiteDescription
              style={{
                fontWeight: 700,
                fontSize: "15px",
                fontFamily: "sans-serif",
                bottom: 10,
                left: UNIT * 7,
                display: "inline-block",
                position: "absolute",
                color: topbar.color,
              }}
            />
          </div>
        </Row>
        <Row style={{ minHeight: "60vh" }}>
          <Col sm={6}>
            <SignUp
              sign_up_error={this.props.sign_up_error}
              strategies={this.props.strategies}
              get_api_key={this.props.get_api_key}
              token={this.props.token}
              has_remember_me={this.props.has_remember_me}
              signing_up={this.props.signing_up}
              has_account={this.props.has_account}
              help_email={this.props.help_email}
              terms_of_service={this.props.terms_of_service}
              terms_of_service_url={this.props.terms_of_service_url}
            />
          </Col>
          <Col sm={6}>
            <div style={{ color: "#666", fontSize: "16pt", marginTop: "5px" }}>
              Create a new account to the left or sign in with an existing
              account above.
              <br />
              {this.render_support()}
              <br />
              {!this.props.get_api_key ? (
                <div>
                  <a href={DOC_URL} target="_blank" rel="noopener">
                    Learn more about CoCalc...
                  </a>
                </div>
              ) : undefined}
            </div>
          </Col>
        </Row>
        <Footer />
      </div>
    );
  }

  public render(): Rendered {
    const main_page = this.render_main_page();
    if (!this.props.get_api_key) {
      return main_page;
    }
    const app = capitalize(this.props.get_api_key);
    return (
      <div>
        <div style={{ padding: "15px" }}>
          <h1>CoCalc API Key Access for {app}</h1>
          <div style={{ fontSize: "12pt", color: "#444" }}>
            {app} would like your CoCalc API key.
            <br />
            <br />
            This grants <b>full access</b> to all of your CoCalc projects to{" "}
            {app}, until you explicitly revoke your API key in Account
            preferences.
            <br />
            <br />
            Please sign in or create an account below.
          </div>
        </div>
        <hr />
        {main_page}
      </div>
    );
  }
}

const tmp = rclass(LandingPage);
export { tmp as LandingPage };
