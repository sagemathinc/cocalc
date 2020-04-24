/*
The account page. This is what you see when you
click "Account" in the upper right.  It has tabs
for different account related information
and configuration.
*/

import { local_storage_length } from "smc-util/misc";
import immutable from "immutable";
import {
  React,
  rclass,
  rtypes,
  redux,
  Rendered,
  Component,
} from "../app-framework";
import { Col, Row, Tab, Tabs } from "../antd-bootstrap";

import { LandingPage } from "../landing-page/landing-page";

//import { AccountSettingsTop } from "../r_account";
const { AccountSettingsTop } = require("../r_account");

import { BillingPage } from "../billing/billing-page";

//import { UpgradesPage } from "../r_upgrades";
const { UpgradesPage } = require("../r_upgrades");

//import { SupportPage } from "../support";
const { SupportPage } = require("../support");
//import { SSHKeysPage } from "../account_ssh_keys";
const { SSHKeysPage } = require("../account_ssh_keys");
import { Icon, Loading } from "../r_misc";
import { SignOut } from "../account/sign-out";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";

// All provided via redux
interface Props {
  // from projects store
  project_map?: immutable.Map<string, any>;

  // from customize store
  kucalc?: string;
  email_enabled?: boolean;
  verify_emails?: boolean;
  ssh_gateway?: boolean;
  is_commercial?: boolean;

  // from the account store
  account_id?: string;
  active_page?: string;
  strategies?: immutable.List<string>;
  sign_up_error?: immutable.Map<string, string>;
  sign_in_error?: string;
  signing_in?: boolean;
  signing_up?: boolean;
  is_logged_in?: boolean;
  forgot_password_error?: string;
  forgot_password_success?: string;
  show_forgot_password?: boolean;
  token?: boolean;
  reset_key?: string;
  reset_password_error?: string;
  remember_me?: boolean;
  has_remember_me?: boolean;
  first_name?: string;
  last_name?: string;
  email_address?: string;
  email_address_verified?: immutable.Map<string, boolean>;
  passports?: immutable.Map<string, any>;
  show_sign_out?: boolean;
  sign_out_error?: string;
  everywhere?: boolean;
  terminal?: immutable.Map<string, any>;
  evaluate_key?: string;
  autosave?: number;
  font_size?: number;
  editor_settings?: immutable.Map<string, any>;
  other_settings?: immutable.Map<string, any>;
  groups?: immutable.List<string>;
  stripe_customer?: immutable.Map<string, any>;
  ssh_keys?: immutable.Map<string, any>;
  is_anonymous?: boolean;
  created?: Date;
}

const ACCOUNT_SPEC = {
  // WARNING: these must ALL be comparable with == and != !!!!!
  account_id: rtypes.string,
  active_page: rtypes.string,
  strategies: rtypes.immutable.List,
  sign_up_error: rtypes.immutable.Map,
  sign_in_error: rtypes.string,
  signing_in: rtypes.bool,
  signing_up: rtypes.bool,
  is_logged_in: rtypes.bool,
  forgot_password_error: rtypes.string,
  forgot_password_success: rtypes.string, // is this needed?
  show_forgot_password: rtypes.bool,
  token: rtypes.bool,
  reset_key: rtypes.string,
  reset_password_error: rtypes.string,
  remember_me: rtypes.bool,
  has_remember_me: rtypes.bool,
  first_name: rtypes.string,
  last_name: rtypes.string,
  email_address: rtypes.string,
  email_address_verified: rtypes.immutable.Map,
  passports: rtypes.immutable.Map,
  show_sign_out: rtypes.bool,
  sign_out_error: rtypes.string,
  everywhere: rtypes.bool,
  terminal: rtypes.immutable.Map,
  evaluate_key: rtypes.string,
  autosave: rtypes.number,
  font_size: rtypes.number,
  editor_settings: rtypes.immutable.Map,
  other_settings: rtypes.immutable.Map,
  groups: rtypes.immutable.List,
  stripe_customer: rtypes.immutable.Map,
  ssh_keys: rtypes.immutable.Map,
  is_anonymous: rtypes.bool,
  created: rtypes.object,
};

class AccountPage extends Component<Props> {
  static reduxProps() {
    return {
      projects: {
        project_map: rtypes.immutable.Map,
      },
      customize: {
        kucalc: rtypes.string,
        email_enabled: rtypes.bool,
        verify_emails: rtypes.bool,
        ssh_gateway: rtypes.bool,
        is_commercial: rtypes.bool,
      },
      account: ACCOUNT_SPEC,
    };
  }

  private handle_select(key: string): void {
    switch (key) {
      case "billing":
        redux.getActions("billing").update_customer();
        break;
      case "support":
        // TODO: rewrite support in typescript...
        (redux.getActions("support") as any).load_support_tickets();
        break;
    }
    redux.getActions("account").set_active_tab(key);
    redux.getActions("account").push_state(`/${key}`);
  }

  private render_upgrades(): Rendered {
    return (
      <UpgradesPage
        redux={redux}
        stripe_customer={this.props.stripe_customer}
        project_map={this.props.project_map}
      />
    );
  }

  private render_ssh_keys_page(): Rendered {
    return (
      <SSHKeysPage
        account_id={this.props.account_id}
        ssh_keys={this.props.ssh_keys}
      />
    );
  }

  private render_account_settings(): Rendered {
    return (
      <AccountSettingsTop
        redux={redux}
        account_id={this.props.account_id}
        first_name={this.props.first_name}
        last_name={this.props.last_name}
        email_address={this.props.email_address}
        email_address_verified={this.props.email_address_verified}
        passports={this.props.passports}
        show_sign_out={this.props.show_sign_out}
        sign_out_error={this.props.sign_out_error}
        everywhere={this.props.everywhere}
        terminal={this.props.terminal}
        evaluate_key={this.props.evaluate_key}
        autosave={this.props.autosave}
        tab_size={this.props.editor_settings?.get("tab_size")}
        font_size={this.props.font_size}
        editor_settings={this.props.editor_settings}
        stripe_customer={this.props.stripe_customer}
        other_settings={this.props.other_settings}
        is_anonymous={this.props.is_anonymous}
        groups={this.props.groups}
        email_enabled={this.props.email_enabled}
        verify_emails={this.props.verify_emails}
        created={this.props.created}
      />
    );
  }

  private render_landing_page(): Rendered {
    return (
      <LandingPage
        strategies={this.props.strategies}
        sign_up_error={this.props.sign_up_error}
        sign_in_error={this.props.sign_in_error}
        signing_in={this.props.signing_in}
        signing_up={this.props.signing_up}
        forgot_password_error={this.props.forgot_password_error}
        forgot_password_success={this.props.forgot_password_success}
        show_forgot_password={this.props.show_forgot_password}
        token={this.props.token}
        reset_key={this.props.reset_key}
        reset_password_error={this.props.reset_password_error}
        remember_me={this.props.remember_me}
        has_remember_me={this.props.has_remember_me}
        has_account={local_storage_length() > 0}
      />
    );
  }

  private render_account_tab(): Rendered {
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
        {this.props.active_page == null || this.props.active_page === "account"
          ? this.render_account_settings()
          : undefined}
      </Tab>
    );
  }

  private render_special_tabs(): Rendered[] {
    // adds a few conditional tabs
    if (this.props.is_anonymous) {
      // None of these make any sense for a temporary anonymous account.
      return [];
    }
    const v: Rendered[] = [];
    if (this.props.is_commercial) {
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
          {this.props.active_page === "billing" ? (
            <BillingPage is_simplified={false} />
          ) : undefined}
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
          {this.props.active_page === "upgrades"
            ? this.render_upgrades()
            : undefined}
        </Tab>
      );
    }
    if (this.props.ssh_gateway || this.props.kucalc === KUCALC_COCALC_COM) {
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
          {this.props.active_page === "ssh-keys"
            ? this.render_ssh_keys_page()
            : undefined}
        </Tab>
      );
    }
    if (this.props.is_commercial) {
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
          {this.props.active_page === "support" ? <SupportPage /> : undefined}
        </Tab>
      );
    }
    return v;
  }

  private render_loading_view(): Rendered {
    return (
      <div style={{ textAlign: "center", paddingTop: "15px" }}>
        <Loading theme={"medium"} />
      </div>
    );
  }

  private render_logged_in_view(): Rendered {
    if (!this.props.account_id) {
      return this.render_loading_view();
    }
    if (this.props.is_anonymous) {
      return (
        <div style={{ margin: "5% 10%" }}>{this.render_account_settings()}</div>
      );
    }
    const tabs: Rendered[] = [this.render_account_tab()].concat(
      this.render_special_tabs()
    );
    return (
      <Row>
        <Col md={12}>
          <div style={{ float: "right", marginTop: "1rem" }}>
            <SignOut everywhere={false} danger={true} />
          </div>
          <Tabs
            activeKey={this.props.active_page ?? "account"}
            onSelect={this.handle_select.bind(this)}
            animation={false}
            style={{ paddingTop: "1em" }}
          >
            {tabs}
          </Tabs>
        </Col>
      </Row>
    );
  }

  public render(): Rendered {
    return (
      <div style={{ overflow: "auto", paddingLeft: "8%", paddingRight: "8%" }}>
        {this.props.is_logged_in
          ? this.render_logged_in_view()
          : this.render_landing_page()}
      </div>
    );
  }
}

const tmp = rclass(AccountPage);
export { tmp as AccountPage };
