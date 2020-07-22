/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The account page. This is what you see when you
click "Account" in the upper right.  It has tabs
for different account related information
and configuration.
*/

import { local_storage_length } from "smc-util/misc";
import { React, redux, useTypedRedux } from "../app-framework";
import { Col, Row, Tab, Tabs } from "../antd-bootstrap";
import { LandingPage } from "../landing-page/landing-page";
import { AccountPreferences } from "./account-preferences";
import { BillingPage } from "../billing/billing-page";
import { UpgradesPage } from "./upgrades/upgrades-page";
import { LicensesPage } from "./licenses/licenses-page";

import { SupportTickets } from "../support";
import { SSHKeysPage } from "./ssh-keys/global-ssh-keys";
import { Icon, Loading } from "../r_misc";
import { SignOut } from "../account/sign-out";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";

export const AccountPage: React.FC = () => {
  const active_page = useTypedRedux("account", "active_page");
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const account_id = useTypedRedux("account", "account_id");
  const first_name = useTypedRedux("account", "first_name");
  const last_name = useTypedRedux("account", "last_name");
  const email_address = useTypedRedux("account", "email_address");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified"
  );
  const passports = useTypedRedux("account", "passports");
  const sign_out_error = useTypedRedux("account", "sign_out_error");
  const terminal = useTypedRedux("account", "terminal");
  const evaluate_key = useTypedRedux("account", "evaluate_key");
  const autosave = useTypedRedux("account", "autosave");
  const font_size = useTypedRedux("account", "font_size");
  const editor_settings = useTypedRedux("account", "editor_settings");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const groups = useTypedRedux("account", "groups");
  const created = useTypedRedux("account", "created");
  const strategies = useTypedRedux("account", "strategies");
  const sign_up_error = useTypedRedux("account", "sign_up_error");
  const sign_in_error = useTypedRedux("account", "sign_in_error");
  const signing_in = useTypedRedux("account", "signing_in");
  const signing_up = useTypedRedux("account", "signing_up");
  const forgot_password_error = useTypedRedux(
    "account",
    "forgot_password_error"
  );
  const forgot_password_success = useTypedRedux(
    "account",
    "forgot_password_success"
  );
  const show_forgot_password = useTypedRedux("account", "show_forgot_password");
  const token = useTypedRedux("account", "token");
  const reset_key = useTypedRedux("account", "reset_key");
  const reset_password_error = useTypedRedux("account", "reset_password_error");
  const remember_me = useTypedRedux("account", "remember_me");
  const has_remember_me = useTypedRedux("account", "has_remember_me");

  const kucalc = useTypedRedux("customize", "kucalc");
  const email_enabled = useTypedRedux("customize", "email_enabled");
  const verify_emails = useTypedRedux("customize", "verify_emails");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
  const is_commercial = useTypedRedux("customize", "is_commercial");

  function handle_select(key: string): void {
    switch (key) {
      case "billing":
        redux.getActions("billing").update_customer();
        break;
      case "support":
        redux.getActions("support").load_support_tickets();
        break;
      case "signout":
        return;
    }
    redux.getActions("account").set_active_tab(key);
    redux.getActions("account").push_state(`/${key}`);
  }

  function render_account_settings(): JSX.Element {
    return (
      <AccountPreferences
        account_id={account_id}
        first_name={first_name}
        last_name={last_name}
        email_address={email_address}
        email_address_verified={email_address_verified}
        passports={passports}
        sign_out_error={sign_out_error}
        terminal={terminal}
        evaluate_key={evaluate_key}
        autosave={autosave}
        tab_size={editor_settings?.get("tab_size")}
        font_size={font_size}
        editor_settings={editor_settings}
        stripe_customer={stripe_customer}
        other_settings={other_settings}
        is_anonymous={is_anonymous}
        groups={groups}
        email_enabled={email_enabled}
        verify_emails={verify_emails}
        created={created}
        strategies={strategies}
      />
    );
  }

  function render_landing_page(): JSX.Element {
    return (
      <LandingPage
        strategies={strategies}
        sign_up_error={sign_up_error}
        sign_in_error={sign_in_error}
        signing_in={signing_in}
        signing_up={signing_up}
        forgot_password_error={forgot_password_error}
        forgot_password_success={forgot_password_success}
        show_forgot_password={show_forgot_password}
        token={token}
        reset_key={reset_key}
        reset_password_error={reset_password_error}
        remember_me={remember_me}
        has_remember_me={has_remember_me}
        has_account={local_storage_length() > 0}
      />
    );
  }

  function render_account_tab(): JSX.Element {
    return (
      <Tab
        key="account"
        eventKey="account"
        title={
          <span>
            <Icon name="wrench" /> Preferences
          </span>
        }
      >
        {(active_page == null || active_page === "account") &&
          render_account_settings()}
      </Tab>
    );
  }

  function render_special_tabs(): JSX.Element[] {
    // adds a few conditional tabs
    if (is_anonymous) {
      // None of these make any sense for a temporary anonymous account.
      return [];
    }
    const v: JSX.Element[] = [];
    if (is_commercial) {
      v.push(
        <Tab
          key="billing"
          eventKey="billing"
          title={
            <span>
              <Icon name="money" /> {"Subscriptions and Course Packages"}
            </span>
          }
        >
          {active_page === "billing" && <BillingPage is_simplified={false} />}
        </Tab>
      );
      v.push(
        <Tab
          key="upgrades"
          eventKey="upgrades"
          title={
            <span>
              <Icon name="arrow-circle-up" /> Upgrades
            </span>
          }
        >
          {active_page === "upgrades" && <UpgradesPage />}
        </Tab>
      );
      // Hide for dev purposes.
      v.push(
        <Tab
          key="licenses"
          eventKey="licenses"
          title={
            <span>
              <Icon name="key" /> Licenses
            </span>
          }
        >
          {active_page === "licenses" && <LicensesPage />}
        </Tab>
      );
    }
    if (ssh_gateway || kucalc === KUCALC_COCALC_COM) {
      v.push(
        <Tab
          key="ssh-keys"
          eventKey="ssh-keys"
          title={
            <span>
              <Icon name="key" /> SSH keys
            </span>
          }
        >
          {active_page === "ssh-keys" && <SSHKeysPage />}
        </Tab>
      );
    }
    if (is_commercial) {
      v.push(
        <Tab
          key="support"
          eventKey="support"
          title={
            <span>
              <Icon name="medkit" /> Support
            </span>
          }
        >
          {active_page === "support" && <SupportTickets />}
        </Tab>
      );
    }
    return v;
  }

  function render_logged_in_view(): JSX.Element {
    if (!account_id) {
      return (
        <div style={{ textAlign: "center", paddingTop: "15px" }}>
          <Loading theme={"medium"} />
        </div>
      );
    }
    if (is_anonymous) {
      return (
        <div style={{ margin: "15px 10%" }}>{render_account_settings()}</div>
      );
    }
    const tabs: JSX.Element[] = [render_account_tab()].concat(
      render_special_tabs()
    );
    return (
      <Row>
        <Col md={12}>
          <Tabs
            activeKey={active_page ?? "account"}
            onSelect={handle_select}
            animation={false}
            tabBarExtraContent={<SignOut everywhere={false} highlight={true} />}
          >
            {tabs}
          </Tabs>
        </Col>
      </Row>
    );
  }

  return (
    <div style={{ overflow: "auto", paddingLeft: "5%", paddingRight: "5%" }}>
      {is_logged_in ? render_logged_in_view() : render_landing_page()}
    </div>
  );
};
