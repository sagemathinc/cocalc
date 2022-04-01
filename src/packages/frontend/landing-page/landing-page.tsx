/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The Landing Page
*/

import * as immutable from "immutable";
import { Component, rclass, rtypes, Rendered } from "../app-framework";
import { Row, Col, Alert } from "../antd-bootstrap";
import { UNIT } from "../components";
import { SiteDescription, Footer } from "../customize";
import { SignIn } from "./sign-in";
import { ForgotPassword } from "./forgot-password";
import { ResetPassword } from "./reset-password";
import { Connecting } from "./connecting";
import { QueryParams } from "../misc/query-params";
import {
  NAME as LAUNCH_ACTIONS_NAME,
  launch_action_description,
  LaunchTypes,
} from "../launch/actions";
import { NAME as ComputeImageStoreName } from "../custom-software/util";
import { ComputeImages, launchcode2display } from "../custom-software/init";
import { PassportStrategy } from "../account/passport-types";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { APP_ICON_WHITE, APP_LOGO_NAME_WHITE } from "../art";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

const DESC_FONT = "sans-serif";

interface Props {
  strategies?: immutable.List<PassportStrategy>;
  exclusive_sso_domains?: Set<string>;
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

  site_name?: string;
  is_commercial?: boolean;
  _is_configured?: boolean;
  logo_square?: string;
  logo_rectangular?: string;
  help_email?: string;
  terms_of_service?: string;
  terms_of_service_url?: string;
  email_signup?: boolean;

  sign_in_email_address?: string;

  type?: LaunchTypes;
  launch?: string;
  images?: ComputeImages;
}

interface State {
  show_terms: boolean;
}

class LandingPage extends Component<Props & reduxProps, State> {
  constructor(props) {
    super(props);
    const show_terms =
      props.terms_of_service?.length > 0 ||
      props.terms_of_service_url?.length > 0;
    this.state = {
      show_terms,
    };
  }

  static reduxProps() {
    return {
      page: {
        get_api_key: rtypes.string,
      },
      customize: {
        site_name: rtypes.bool,
        is_commercial: rtypes.bool,
        _is_configured: rtypes.bool,
        logo_square: rtypes.string,
        logo_rectangular: rtypes.string,
        help_email: rtypes.string,
        terms_of_service: rtypes.string,
        terms_of_service_url: rtypes.string,
        email_signup: rtypes.bool,
      },
      account: {
        sign_in_email_address: rtypes.string,
      },
      [LAUNCH_ACTIONS_NAME]: {
        type: rtypes.string,
        launch: rtypes.string,
      },
      [ComputeImageStoreName]: {
        images: rtypes.immutable,
      },
    };
  }

  private render_password_reset(): Rendered {
    const reset_key = this.props.reset_key;
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

  private render_launch_action(): Rendered {
    if (
      this.props.type == null ||
      this.props.launch == null ||
      this.props.images == null
    ) {
      return;
    }
    const descr = launch_action_description(this.props.type);
    if (descr == null) return;
    let message;
    let bsStyle: "info" | "danger" = "info";

    if (this.props.type == "csi") {
      const display = launchcode2display(this.props.images, this.props.launch);

      if (display == null) {
        bsStyle = "danger";
        message = (
          <>
            Custom Software Image <code>{this.props.launch}</code> does not
            exist!
          </>
        );
      } else {
        message = (
          <>
            {descr} "{display}"
          </>
        );
      }
    } else {
      message = (
        <>
          {descr}: <code>{this.props.launch}</code>
        </>
      );
    }

    return (
      <Row style={{ marginBottom: "20px", textAlign: "center" }}>
        <Alert bsStyle={bsStyle} banner={true} style={{ width: "100%" }}>
          <b>Launch action:</b> {message}
        </Alert>
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
            minHeight: 160,
          }}
          className="hidden-xs"
        >
          <div
            style={{
              width: 490,
              zIndex: 10,
              position: "absolute",
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
        <Row
          style={{
            color: COLORS.GRAY,
            fontSize: "16pt",
            margin: "150px 0",
            textAlign: "center",
          }}
        >
          <Col sm={12}>
            <a href={join(appBasePath, "/auth/sign-up")}>
              Create a new account
            </a>{" "}
            or{" "}
            <a href={join(appBasePath, "/auth/sign-in")}>
              sign in with an existing account
            </a>
            .
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
            If necessary, please{" "}
            <a href={join(appBasePath, "/auth/sign-up")}>
              create a new account
            </a>{" "}
            or{" "}
            <a href={join(appBasePath, "/auth/sign-in")}>
              sign in with an existing account
            </a>
            .
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
