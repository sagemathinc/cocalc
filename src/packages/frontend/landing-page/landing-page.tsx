/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The Landing Page
*/

import { Alert, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  Rendered,
  TypedMap,
  useMemo,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, UNIT } from "@cocalc/frontend/components";
import { Footer, SiteDescription } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { capitalize } from "@cocalc/util/misc";
import { COLORS, DOC_URL } from "@cocalc/util/theme";
import * as immutable from "immutable";
import { PassportStrategyFrontend } from "../account/passport-types";
import { APP_ICON_WHITE, APP_LOGO_NAME_WHITE } from "../art";
import { ComputeImages, launchcode2display } from "../custom-software/init";
import { NAME as ComputeImageStoreName } from "../custom-software/util";
import {
  LaunchTypes,
  launch_action_description,
  NAME as LAUNCH_ACTIONS_NAME,
} from "../launch/actions";
import { ShowSupportLink } from "../support";
import { Connecting } from "./connecting";
import { ForgotPassword } from "./forgot-password";
import { ResetPassword } from "./reset-password";
import { RunAnonymously } from "./run-anonymously";
import { SignIn } from "./sign-in";
import { SignUp } from "./sign-up";

const DESC_FONT = "sans-serif";

interface Props {
  strategies?: immutable.List<TypedMap<PassportStrategyFrontend>>;
  exclusive_sso_domains?: Set<string>;
  sign_up_error?: TypedMap<{ generic: string }>;
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

export const LandingPage: React.FC<Props> = (props: Props) => {
  const {
    strategies,
    exclusive_sso_domains,
    sign_up_error,
    sign_in_error,
    signing_in,
    signing_up,
    forgot_password_error,
    forgot_password_success,
    show_forgot_password,
    token,
    reset_key,
    reset_password_error,
    remember_me,
    has_remember_me,
    has_account,
  } = props;

  const get_api_key = useTypedRedux("page", "get_api_key");
  //const site_name = useTypedRedux("customize", "site_name");
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const _is_configured = useTypedRedux("customize", "_is_configured");
  const logo_square = useTypedRedux("customize", "logo_square");
  const logo_rectangular = useTypedRedux("customize", "logo_rectangular");
  const help_email = useTypedRedux("customize", "help_email");
  const terms_of_service = useTypedRedux("customize", "terms_of_service");
  const terms_of_service_url = useTypedRedux(
    "customize",
    "terms_of_service_url"
  );
  const email_signup = useTypedRedux("customize", "email_signup");
  const sign_in_email_address = useTypedRedux(
    "account",
    "sign_in_email_address"
  );
  const type: LaunchTypes | undefined = useRedux(LAUNCH_ACTIONS_NAME, "type");
  const launch: string | undefined = useRedux(LAUNCH_ACTIONS_NAME, "launch");
  const images: ComputeImages | undefined = useTypedRedux(
    ComputeImageStoreName,
    "images"
  );

  const show_terms: boolean = useMemo(() => {
    return terms_of_service?.length > 0 || terms_of_service_url?.length > 0;
  }, [terms_of_service, terms_of_service_url]);

  function render_password_reset(): Rendered {
    if (!reset_key) return;
    return (
      <ResetPassword
        reset_key={reset_key}
        reset_password_error={reset_password_error}
        help_email={help_email}
      />
    );
  }

  function render_forgot_password(): Rendered {
    if (!show_forgot_password) {
      return;
    }
    return (
      <ForgotPassword
        initial_email_address={sign_in_email_address ?? ""}
        forgot_password_error={forgot_password_error}
        forgot_password_success={forgot_password_success}
      />
    );
  }

  function render_support(): Rendered {
    if (!is_commercial) {
      return;
    }

    return (
      <div>
        Questions? Create <ShowSupportLink />
      </div>
    );
  }

  function render_launch_action(): Rendered {
    if (type == null || launch == null || images == null) {
      return;
    }
    const descr = launch_action_description(type);
    if (descr == null) return;
    let message;
    let bsStyle: "info" | "danger" = "info";

    if (type == "csi") {
      const display = launchcode2display(images, launch);

      if (display == null) {
        bsStyle = "danger";
        message = (
          <>
            Custom Software Image <code>{launch}</code> does not exist!
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
          {descr}: <code>{launch}</code>
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

  function render_main_page(): JSX.Element {
    let main_row_style;
    if ((remember_me || QueryParams.get("auth_token")) && !get_api_key) {
      // Just assume user will be signing in.
      return <Connecting />;
    }

    const img_icon = !!logo_square ? logo_square : APP_ICON_WHITE;
    const img_name = !!logo_rectangular
      ? logo_rectangular
      : APP_LOGO_NAME_WHITE;
    const customized = !!logo_square && !!logo_rectangular;

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
        {render_launch_action()}
        {render_password_reset()}
        {render_forgot_password()}
        <Row style={main_row_style} className={"visible-xs"}>
          <SignIn
            get_api_key={get_api_key}
            signing_in={signing_in}
            sign_in_error={sign_in_error}
            has_account={has_account}
            xs={true}
            strategies={strategies}
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
              get_api_key={get_api_key}
              signing_in={signing_in}
              sign_in_error={sign_in_error}
              has_account={has_account}
              xs={false}
              strategies={strategies}
              color={topbar.color}
            />
          </div>
          {_is_configured ? (
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
            margin: "15px 0",
            textAlign: "center",
          }}
        >
          <Col sm={12}>
            <b>Create a new account</b> below on the left or <b>sign in</b> with
            an existing account above.
          </Col>
        </Row>
        <Row style={{ minHeight: "60vh" }}>
          <Col md={6}>
            <SignUp
              sign_up_error={sign_up_error}
              strategies={strategies}
              get_api_key={get_api_key}
              token={token}
              has_remember_me={has_remember_me}
              signing_up={signing_up}
              has_account={has_account}
              help_email={help_email}
              terms_of_service={terms_of_service}
              terms_of_service_url={terms_of_service_url}
              email_signup={email_signup}
              exclusive_sso_domains={exclusive_sso_domains}
            />
          </Col>
          <Col md={6}>
            <div style={{ color: COLORS.GRAY, marginTop: "5px" }}>
              <RunAnonymously show_terms={show_terms} />
              <br />
              <div style={{ textAlign: "center" }}>
                {render_support()}
                <br />
                {!get_api_key ? (
                  <div>
                    <A href={DOC_URL}>CoCalc documentation</A>
                  </div>
                ) : undefined}
                <br />
                {!get_api_key ? (
                  <div>
                    <a href={appBasePath}>Landing page</a>
                  </div>
                ) : undefined}
              </div>
            </div>
          </Col>
        </Row>
        <Footer />
      </div>
    );
  }

  const main_page = render_main_page();
  if (!get_api_key) {
    return main_page;
  } else {
    const app = capitalize(get_api_key);
    return (
      <div>
        <div style={{ padding: "15px" }}>
          <h1>CoCalc API Key Access for {app}</h1>
          <div style={{ fontSize: "12pt", color: "#444" }}>
            {app} would like your CoCalc API key.
            <br />
            <br />
            This grants <b>full access</b> to all of your CoCalc projects to{" "}
            {app}
            , until you explicitly revoke your API key in Account preferences.
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
};
