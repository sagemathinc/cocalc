/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert as AntdAlert, Space } from "antd";
import { List, Map } from "immutable";
import { join } from "path";
import { FormattedMessage, useIntl } from "react-intl";

import {
  Alert,
  Button,
  ButtonToolbar,
  Checkbox,
  Col,
  Panel,
  Row,
  Well,
} from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  Rendered,
  TypedMap,
  redux,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  A,
  ErrorDisplay,
  Gap,
  Icon,
  TimeAgo,
} from "@cocalc/frontend/components";
import { SiteName, TermsOfService } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import {
  PassportStrategyIcon,
  strategy2display,
} from "@cocalc/frontend/passports";
import { log } from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { keys, startswith } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PassportStrategyFrontend } from "@cocalc/util/types/passport-types";
import { AccountState } from "../types";
import { DeleteAccount } from "../delete-account";
import { ACCOUNT_PROFILE_ICON_NAME } from "../account-preferences-profile";
import { SignOut } from "../sign-out";
import { set_account_table, ugly_error } from "../util";
import { EmailAddressSetting } from "./email-address-setting";
import { EmailVerification } from "./email-verification";
import { PasswordSetting } from "./password-setting";
import { TextSetting } from "./text-setting";

type ImmutablePassportStrategy = TypedMap<PassportStrategyFrontend>;

interface Props {
  account_id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  unlisted?: boolean;
  email_address?: string;
  email_address_verified?: Map<string, any>;
  passports?: Map<string, any>;
  sign_out_error?: string;
  delete_account_error?: string;
  other_settings?: AccountState["other_settings"];
  is_anonymous?: boolean;
  email_enabled?: boolean;
  verify_emails?: boolean;
  created?: Date;
  strategies?: List<ImmutablePassportStrategy>;
}

export function AccountSettings(props: Readonly<Props>) {
  const intl = useIntl();

  const [add_strategy_link, set_add_strategy_link] = useState<
    string | undefined
  >(undefined);
  const [remove_strategy_button, set_remove_strategy_button] = useState<
    string | undefined
  >(undefined);
  const [terms_checkbox, set_terms_checkbox] = useState<boolean>(false);
  const [show_delete_confirmation, set_show_delete_confirmation] =
    useState<boolean>(false);
  const [username, set_username] = useState<boolean>(false);

  const actions = () => redux.getActions("account");

  function handle_change(evt, field) {
    actions().setState({ [field]: evt.target.value });
  }

  function save_change(evt, field: string): void {
    const { value } = evt.target;
    set_account_table({ [field]: value });
  }

  function get_strategy(name: string): ImmutablePassportStrategy | undefined {
    if (props.strategies == null) return undefined;
    return props.strategies.find((val) => val.get("name") == name);
  }

  function render_add_strategy_link(): Rendered {
    if (!add_strategy_link) {
      return;
    }
    const strategy_name = add_strategy_link;
    const strategy = get_strategy(strategy_name);
    if (strategy == null) return;
    const strategy_js = strategy.toJS();
    const name = strategy2display(strategy_js);
    const href = join(appBasePath, "auth", add_strategy_link);
    return (
      <Well>
        <h4>
          <PassportStrategyIcon strategy={strategy_js} /> {name}
        </h4>
        Link to your {name} account, so you can use {name} to login to your{" "}
        <SiteName /> account.
        <br /> <br />
        <ButtonToolbar style={{ textAlign: "center" }}>
          <Button
            href={href}
            target="_blank"
            onClick={() => {
              set_add_strategy_link(undefined);
              if (props.is_anonymous) {
                log("add_passport", {
                  passport: name,
                  source: "anonymous_account",
                });
              }
            }}
          >
            <Icon name="external-link" /> Link My {name} Account
          </Button>
          <Button onClick={() => set_add_strategy_link(undefined)}>
            <CancelText />
          </Button>
        </ButtonToolbar>
      </Well>
    );
  }

  async function remove_strategy_click(): Promise<void> {
    const strategy = remove_strategy_button;
    set_remove_strategy_button(undefined);
    set_add_strategy_link(undefined);
    if (strategy == null) return;
    const obj = props.passports?.toJS() ?? {};
    let id: string | undefined = undefined;
    for (const k in obj) {
      if (startswith(k, strategy)) {
        id = k.split("-")[1];
        break;
      }
    }
    if (!id) {
      return;
    }
    try {
      await webapp_client.account_client.unlink_passport(strategy, id);
      // console.log("ret:", x);
    } catch (err) {
      ugly_error(err);
    }
  }

  function render_remove_strategy_button(): Rendered {
    if (!remove_strategy_button) {
      return;
    }
    const strategy_name = remove_strategy_button;
    const strategy = get_strategy(strategy_name);
    if (strategy == null) return;
    const strategy_js = strategy.toJS();
    const name = strategy2display(strategy_js);
    if ((props.passports?.size ?? 0) <= 1 && !props.email_address) {
      return (
        <Well>
          You must set an email address above or add another login method before
          you can disable login to your <SiteName /> account using your {name}{" "}
          account. Otherwise you would completely lose access to your account!
        </Well>
      );
      // TODO: flesh out the case where the UI prevents a user from unlinking an exclusive sso strategy
      // Right now, the backend blocks
    } else if (false) {
      return (
        <Well>You are not allowed to remove the passport strategy {name}.</Well>
      );
    } else {
      return (
        <Well>
          <h4>
            <PassportStrategyIcon strategy={strategy_js} /> {name}
          </h4>
          Your <SiteName /> account is linked to your {name} account, so you can
          login using it.
          <br /> <br />
          If you unlink your {name} account, you will no longer be able to use
          this account to log into <SiteName />.
          <br /> <br />
          <ButtonToolbar style={{ textAlign: "center" }}>
            <Button bsStyle="danger" onClick={remove_strategy_click}>
              <Icon name="unlink" /> Unlink my {name} account
            </Button>
            <Button onClick={() => set_remove_strategy_button(undefined)}>
              <CancelText />
            </Button>
          </ButtonToolbar>
        </Well>
      );
    }
  }

  function render_strategy(
    strategy: ImmutablePassportStrategy,
    account_passports: string[],
  ): Rendered {
    if (strategy.get("name") !== "email") {
      const is_configured = account_passports.includes(strategy.get("name"));
      const strategy_js = strategy.toJS();
      const btn = (
        <Button
          disabled={props.is_anonymous && !terms_checkbox}
          onClick={() => {
            if (is_configured) {
              set_remove_strategy_button(strategy.get("name"));
              set_add_strategy_link(undefined);
            } else {
              set_add_strategy_link(strategy.get("name"));
              set_remove_strategy_button(undefined);
            }
          }}
          key={strategy.get("name")}
          bsStyle={is_configured ? "info" : undefined}
        >
          <PassportStrategyIcon strategy={strategy_js} small={true} />{" "}
          {strategy2display(strategy_js)}
        </Button>
      );
      return btn;
    }
  }

  function render_sign_out_error(): Rendered {
    if (!props.sign_out_error) {
      return;
    }
    return (
      <ErrorDisplay
        style={{ margin: "5px 0" }}
        error={props.sign_out_error}
        onClose={() => actions().setState({ sign_out_error: "" })}
      />
    );
  }

  function render_sign_out_buttons(): Rendered {
    return (
      <Row
        style={{
          marginTop: "15px",
          borderTop: "1px solid #ccc",
          paddingTop: "15px",
        }}
      >
        <Col xs={12}>
          <div className="pull-right">
            <SignOut everywhere={false} highlight={true} />
            {!props.is_anonymous ? <Gap /> : undefined}
            {!props.is_anonymous ? <SignOut everywhere={true} /> : undefined}
          </div>
        </Col>
      </Row>
    );
  }

  function get_account_passport_names(): string[] {
    return keys(props.passports?.toJS() ?? {}).map((x) =>
      x.slice(0, x.indexOf("-")),
    );
  }

  function render_linked_external_accounts(): Rendered {
    if (props.strategies == null || props.strategies.size <= 1) {
      // not configured by server
      return;
    }
    const account_passports: string[] = get_account_passport_names();

    const linked: List<ImmutablePassportStrategy> = props.strategies.filter(
      (strategy) => {
        const name = strategy?.get("name");
        return name !== "email" && account_passports.includes(name);
      },
    );
    if (linked.size === 0) return;

    const btns = linked
      .map((strategy) => render_strategy(strategy, account_passports))
      .toArray();
    return (
      <div>
        <hr key="hr0" />
        <h5 style={{ color: COLORS.GRAY_M }}>
          {intl.formatMessage({
            id: "account.settings.sso.account_is_linked",
            defaultMessage: "Your account is linked with (click to unlink)",
          })}
        </h5>
        <ButtonToolbar style={{ marginBottom: "10px", display: "flex" }}>
          {btns}
        </ButtonToolbar>
        {render_remove_strategy_button()}
      </div>
    );
  }

  function render_available_to_link(): Rendered {
    if (props.strategies == null || props.strategies.size <= 1) {
      // not configured by server yet, or nothing but email
      return;
    }
    const account_passports: string[] = get_account_passport_names();

    let any_hidden = false;
    const not_linked: List<ImmutablePassportStrategy> = props.strategies.filter(
      (strategy) => {
        const name = strategy.get("name");
        // skip the email strategy, we don't use it
        if (name === "email") return false;
        // filter those which are already linked
        if (account_passports.includes(name)) return false;
        // do not show the non-public ones, unless they shouldn't be hidden
        if (
          !strategy.get("public", true) &&
          !strategy.get("do_not_hide", false)
        ) {
          any_hidden = true;
          return false;
        }
        return true;
      },
    );
    if (any_hidden === false && not_linked.size === 0) return;

    const heading = intl.formatMessage(
      {
        id: "account.settings.sso.link_your_account",
        defaultMessage: `{is_anonymous, select,
          true {Sign up using your account at}
          other {Click to link your account}}`,
      },
      { is_anonymous: props.is_anonymous },
    );

    const btns = not_linked
      .map((strategy) => render_strategy(strategy, account_passports))
      .toArray();

    // add an extra button to link to the non public ones, which aren't shown
    if (any_hidden) {
      btns.push(
        <Button
          key="sso"
          onClick={() => open_new_tab(join(appBasePath, "sso"))}
          bsStyle="info"
        >
          Other SSO
        </Button>,
      );
    }
    return (
      <div>
        <hr key="hr0" />
        <h5 style={{ color: COLORS.GRAY_M }}>{heading}</h5>
        <Space size={[10, 10]} wrap style={{ marginBottom: "10px" }}>
          {btns}
        </Space>
        {render_add_strategy_link()}
      </div>
    );
  }

  function render_anonymous_warning(): Rendered {
    if (!props.is_anonymous) {
      return;
    }
    // makes no sense to delete an account that is anonymous; it'll
    // get automatically deleted.
    return (
      <div>
        <Alert bsStyle="warning" style={{ marginTop: "10px" }}>
          <h4>Sign up</h4>
          Signing up is free, avoids losing access to your work, you get added
          to projects you were invited to, and you unlock{" "}
          <A href="https://doc.cocalc.com/">many additional features</A>!
          <br />
          <br />
          <h4>Sign in</h4>
          If you already have a <SiteName /> account, <SignOut sign_in={true} />
          . Note that you will lose any work you've done anonymously here.
        </Alert>
        <hr />
      </div>
    );
  }

  function render_delete_account(): Rendered {
    if (props.is_anonymous) {
      return;
    }
    return (
      <Row>
        <Col xs={12}>
          <DeleteAccount
            style={{ marginTop: "1ex" }}
            initial_click={() => set_show_delete_confirmation(true)}
            confirm_click={() => actions().delete_account()}
            cancel_click={() => set_show_delete_confirmation(false)}
            user_name={(props.first_name + " " + props.last_name).trim()}
            show_confirmation={show_delete_confirmation}
          />
        </Col>
      </Row>
    );
  }

  function render_password(): Rendered {
    if (!props.email_address) {
      // makes no sense to change password if don't have an email address
      return;
    }
    return <PasswordSetting />;
  }

  function render_terms_of_service(): Rendered {
    if (!props.is_anonymous) {
      return;
    }
    const style: React.CSSProperties = { padding: "10px 20px" };
    if (terms_checkbox) {
      style.border = "2px solid #ccc";
    } else {
      style.border = "2px solid red";
    }
    return (
      <div style={style}>
        <Checkbox
          checked={terms_checkbox}
          onChange={(e) => set_terms_checkbox(e.target.checked)}
        >
          <TermsOfService style={{ display: "inline" }} />
        </Checkbox>
      </div>
    );
  }

  function render_header(): Rendered {
    if (props.is_anonymous) {
      return (
        <b>
          Thank you for using <SiteName />!
        </b>
      );
    } else {
      return (
        <>
          <Icon name={ACCOUNT_PROFILE_ICON_NAME} />{" "}
          {intl.formatMessage(labels.account)}
        </>
      );
    }
  }

  function render_created(): Rendered {
    if (props.is_anonymous || !props.created) {
      return;
    }
    return (
      <Row style={{ marginBottom: "15px" }}>
        <Col md={4}>
          <FormattedMessage
            id="account.settings.created.label"
            defaultMessage={"Created"}
          />
        </Col>
        <Col md={8}>
          <TimeAgo date={props.created} />
        </Col>
      </Row>
    );
  }

  function render_name(): Rendered {
    return (
      <>
        <TextSetting
          label={intl.formatMessage(labels.account_first_name)}
          value={props.first_name}
          onChange={(e) => handle_change(e, "first_name")}
          onBlur={(e) => save_change(e, "first_name")}
          onPressEnter={(e) => save_change(e, "first_name")}
          maxLength={254}
          disabled={props.is_anonymous && !terms_checkbox}
        />
        <TextSetting
          label={intl.formatMessage(labels.account_last_name)}
          value={props.last_name}
          onChange={(e) => handle_change(e, "last_name")}
          onBlur={(e) => save_change(e, "last_name")}
          onPressEnter={(e) => save_change(e, "last_name")}
          maxLength={254}
          disabled={props.is_anonymous && !terms_checkbox}
        />
        <TextSetting
          label={intl.formatMessage({
            id: "account.settings.username.label",
            defaultMessage: "Username (optional)",
          })}
          value={props.name}
          onChange={(e) => {
            const name = e.target.value?.trim();
            actions().setState({ name });
          }}
          onBlur={(e) => {
            set_username(false);
            const name = e.target.value?.trim();
            if (name) {
              set_account_table({ name });
            }
          }}
          onFocus={() => {
            set_username(true);
          }}
          onPressEnter={(e) => {
            const name = e.target.value?.trim();
            if (name) {
              set_account_table({ name });
            }
          }}
          maxLength={39}
          disabled={props.is_anonymous && !terms_checkbox}
        />
        {username && (
          <AntdAlert
            showIcon
            style={{ margin: "15px 0" }}
            message={
              <FormattedMessage
                id="account.settings.username.info"
                defaultMessage={`Setting a username provides optional nicer URL's for shared
public documents. Your username can be between 1 and 39 characters,
contain upper and lower case letters, numbers, and dashes.
{br}
WARNING: If you change your username, existing links using the previous username
will no longer work (automatic redirects are not implemented), so change with caution.`}
                values={{ br: <br /> }}
              />
            }
            type="info"
          />
        )}
      </>
    );
  }

  function render_email_address(): Rendered {
    if (!props.account_id) {
      return; // makes no sense to change email if there is no account
    }
    return (
      <EmailAddressSetting
        email_address={props.email_address}
        is_anonymous={props.is_anonymous}
        disabled={props.is_anonymous && !terms_checkbox}
        verify_emails={props.verify_emails}
      />
    );
  }

  function render_unlisted(): Rendered {
    if (!props.account_id) {
      return; // makes no sense to change unlisted status if there is no account
    }
    return (
      <Checkbox
        checked={props.unlisted}
        onChange={(e) =>
          actions().set_account_table({ unlisted: e.target.checked })
        }
      >
        <FormattedMessage
          id="account.settings.unlisted.label"
          defaultMessage={
            "Unlisted: you can only be found by an exact email address match"
          }
        />
      </Checkbox>
    );
  }

  function render_email_verification(): Rendered {
    if (props.email_enabled && props.verify_emails && !props.is_anonymous) {
      return (
        <EmailVerification
          email_address={props.email_address}
          email_address_verified={props.email_address_verified}
        />
      );
    }
  }

  return (
    <Panel header={render_header()} role="region" aria-label="Account settings">
      {render_anonymous_warning()}
      {render_terms_of_service()}
      {render_name()}
      {render_email_address()}
      {render_unlisted()}
      <div style={{ marginBottom: "15px" }}></div>
      {render_email_verification()}
      {render_password()}
      {render_created()}
      {render_delete_account()}
      {render_linked_external_accounts()}
      {render_available_to_link()}
      {render_sign_out_buttons()}
      {render_sign_out_error()}
    </Panel>
  );
}
