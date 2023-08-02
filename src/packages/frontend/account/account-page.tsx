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

import { SignOut } from "@cocalc/frontend/account/sign-out";
import { AntdTabItem, Col, Row, Tabs } from "@cocalc/frontend/antd-bootstrap";
import { React, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { LandingPage } from "@cocalc/frontend/landing-page/landing-page";
import { local_storage_length } from "@cocalc/frontend/misc/local-storage";
import { SupportTickets } from "@cocalc/frontend/support";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { AccountPreferences } from "./account-preferences";
import { LicensesPage } from "./licenses/licenses-page";
import { PublicPaths } from "./public-paths/public-paths";
import { SSHKeysPage } from "./ssh-keys/global-ssh-keys";
import { UpgradesPage } from "./upgrades/upgrades-page";
import PurchasesPage from "@cocalc/frontend/purchases/purchases-page";
import SubscriptionsPage from "@cocalc/frontend/purchases/subscriptions-page";
import StatementsPage from "@cocalc/frontend/purchases/statements-page";

export const AccountPage: React.FC = () => {
  const active_page = useTypedRedux("account", "active_page");
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const account_id = useTypedRedux("account", "account_id");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
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
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const get_api_key = useTypedRedux("page", "get_api_key");

  // for each exclusive domain, tell the user which strategy to use
  const exclusive_sso_domains = React.useMemo(() => {
    if (strategies == null) return;
    const domains: { [domain: string]: string } = {};
    for (const strat of strategies) {
      const doms = strat.get("exclusive_domains");
      for (const dom of doms ?? []) {
        domains[dom] = strat.get("name");
      }
    }
    return domains;
  }, [strategies]);

  function handle_select(key: string): void {
    switch (key) {
      case "billing":
        redux.getActions("billing").update_customer();
        break;
      case "support":
        break;
      case "signout":
        return;
    }
    redux.getActions("account").set_active_tab(key);
    redux.getActions("account").push_state(`/${key}`);
  }

  function render_landing_page(): JSX.Element {
    return (
      <LandingPage
        strategies={strategies}
        exclusive_sso_domains={exclusive_sso_domains}
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

  function render_account_tab(): AntdTabItem {
    return {
      key: "account",
      label: (
        <span>
          <Icon name="wrench" /> Preferences
        </span>
      ),
      children: (active_page == null || active_page === "account") && (
        <AccountPreferences />
      ),
    };
  }

  function render_special_tabs(): AntdTabItem[] {
    // adds a few conditional tabs
    if (is_anonymous) {
      // None of these make any sense for a temporary anonymous account.
      return [];
    }
    const items: AntdTabItem[] = [];
    if (is_commercial) {
      items.push({
        key: "purchases",
        label: (
          <span>
            <Icon name="money" /> Purchases
          </span>
        ),
        children: active_page === "purchases" && <PurchasesPage />,
      });
      items.push({
        key: "subscriptions",
        label: (
          <span>
            <Icon name="calendar" /> Subscriptions
          </span>
        ),
        children: active_page === "subscriptions" && <SubscriptionsPage />,
      });
      items.push({
        key: "statements",
        label: (
          <span>
            <Icon name="money" /> Statements
          </span>
        ),
        children: active_page === "statements" && <StatementsPage />,
      });
    }

    if (
      kucalc === KUCALC_COCALC_COM ||
      kucalc === KUCALC_ON_PREMISES ||
      is_commercial
    ) {
      items.push({
        key: "licenses",
        label: (
          <span>
            <Icon name="key" /> Licenses
          </span>
        ),
        children: active_page === "licenses" && <LicensesPage />,
      });
    }

    if (ssh_gateway || kucalc === KUCALC_COCALC_COM) {
      items.push({
        key: "ssh-keys",
        label: (
          <span>
            <Icon name="key" /> SSH keys
          </span>
        ),
        children: active_page === "ssh-keys" && <SSHKeysPage />,
      });
    }
    if (is_commercial) {
      items.push({
        key: "support",
        label: (
          <span>
            <Icon name="medkit" /> Support
          </span>
        ),
        children: active_page === "support" && <SupportTickets />,
      });
    }
    items.push({
      key: "public-files",
      label: (
        <span>
          <Icon name="bullhorn" /> Public files
        </span>
      ),
      children: active_page === "public-files" && <PublicPaths />,
    });
    if (is_commercial && kucalc === KUCALC_COCALC_COM) {
      items.push({
        key: "upgrades",
        label: (
          <span>
            <Icon name="arrow-circle-up" /> Upgrades
          </span>
        ),
        children: active_page === "upgrades" && <UpgradesPage />,
      });
    }

    return items;
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
        <div style={{ margin: "15px 10%" }}>
          <AccountPreferences />
        </div>
      );
    }

    const tabs: AntdTabItem[] = [
      render_account_tab(),
      ...render_special_tabs(),
    ];

    return (
      <Row>
        <Col md={12}>
          <Tabs
            activeKey={active_page ?? "account"}
            onSelect={handle_select}
            animation={false}
            tabBarExtraContent={<SignOut everywhere={false} highlight={true} />}
            items={tabs}
          />
        </Col>
      </Row>
    );
  }

  return (
    <div
      className="smc-vfill"
      style={{ overflow: "auto", paddingLeft: "5%", paddingRight: "5%" }}
    >
      {is_logged_in && !get_api_key
        ? render_logged_in_view()
        : render_landing_page()}
    </div>
  );
};
