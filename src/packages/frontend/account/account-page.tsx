/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The account page. This is what you see when you
click "Account" in the upper right.  It has tabs
for different account related information
and configuration.
*/

import { useEffect } from "react";
import { Flex, Menu, Space } from "antd";
import { useIntl } from "react-intl";
import { SignOut } from "@cocalc/frontend/account/sign-out";
import { AntdTabItem } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  redux,
  useIsMountedRef,
  useTypedRedux,
  useWindowDimensions,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { cloudFilesystemsEnabled } from "@cocalc/frontend/compute";
import CloudFilesystems from "@cocalc/frontend/compute/cloud-filesystem/cloud-filesystems";
import { labels } from "@cocalc/frontend/i18n";
import PurchasesPage from "@cocalc/frontend/purchases/purchases-page";
import PaymentsPage from "@cocalc/frontend/purchases/payments-page";
import StatementsPage from "@cocalc/frontend/purchases/statements-page";
import SubscriptionsPage from "@cocalc/frontend/purchases/subscriptions-page";
import { SupportTickets } from "@cocalc/frontend/support";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { AccountPreferences } from "./account-preferences";
import { I18NSelector } from "./i18n-selector";
import { LicensesPage } from "./licenses/licenses-page";
import { PublicPaths } from "./public-paths/public-paths";
import { UpgradesPage } from "./upgrades/upgrades-page";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { Footer } from "@cocalc/frontend/customize";

export const AccountPage: React.FC = () => {
  const intl = useIntl();

  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > 800;

  const active_page = useTypedRedux("account", "active_page") ?? "account";
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const account_id = useTypedRedux("account", "account_id");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const kucalc = useTypedRedux("customize", "kucalc");
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const get_api_key = useTypedRedux("page", "get_api_key");

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

  function render_account_tab(): AntdTabItem {
    return {
      key: "account",
      label: (
        <span>
          <Icon name="address-card" /> {intl.formatMessage(labels.preferences)}
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
            <Icon name="credit-card" /> {intl.formatMessage(labels.purchases)}
          </span>
        ),
        children: active_page === "purchases" && <PurchasesPage />,
      });
      items.push({
        key: "payments",
        label: (
          <span>
            <Icon name="cc-visa" /> Payments
          </span>
        ),
        children: active_page === "payments" && <PaymentsPage />,
      });
      items.push({
        key: "statements",
        label: (
          <span>
            <Icon name="money" /> {intl.formatMessage(labels.statements)}
          </span>
        ),
        children: active_page === "statements" && <StatementsPage />,
      });
      items.push({
        key: "subscriptions",
        label: (
          <span>
            <Icon name="calendar" /> {intl.formatMessage(labels.subscriptions)}
          </span>
        ),
        children: active_page === "subscriptions" && <SubscriptionsPage />,
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
            <Icon name="key" /> {intl.formatMessage(labels.licenses)}
          </span>
        ),
        children: active_page === "licenses" && <LicensesPage />,
      });
    }

    if (is_commercial) {
      items.push({
        key: "support",
        label: (
          <span>
            <Icon name="medkit" /> {intl.formatMessage(labels.support)}
          </span>
        ),
        children: active_page === "support" && <SupportTickets />,
      });
    }
    items.push({
      key: "public-files",
      label: (
        <span>
          <Icon name="share-square" />{" "}
          {intl.formatMessage(labels.published_files)}
        </span>
      ),
      children: active_page === "public-files" && <PublicPaths />,
    });
    if (cloudFilesystemsEnabled()) {
      items.push({
        key: "cloud-filesystems",
        label: (
          <>
            <Icon name="server" style={{ marginRight: "5px" }} />
            {intl.formatMessage(labels.cloud_file_system)}
          </>
        ),
        children: <CloudFilesystems noTitle />,
      });
    }
    if (is_commercial && kucalc === KUCALC_COCALC_COM) {
      // these have been deprecated for ~ 5 years, but some customers still have them.
      items.push({
        key: "upgrades",
        label: (
          <span>
            <Icon name="arrow-circle-up" />{" "}
            {intl.formatMessage(labels.upgrades)}
          </span>
        ),
        children: active_page === "upgrades" && <UpgradesPage />,
      });
    }
    return items;
  }

  function renderExtraContent() {
    return (
      <Space>
        <I18NSelector isWide={isWide} />
        <SignOut everywhere={false} highlight={true} narrow={!isWide} />
      </Space>
    );
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

    // NOTE: This is a bit weird, since I rewrote it form antd Tabs
    // to an antd Menu, but didn't change any of the above.
    // Antd Menu has a notion of children and submenus, which we *could*
    // use but aren't using yet.
    const children = {};
    const titles = {};
    for (const tab of tabs) {
      children[tab.key] = tab.children;
      titles[tab.key] = tab.label;
      delete tab.children;
    }

    return (
      <div className="smc-vfill" style={{ flexDirection: "row" }}>
        <div
          style={{
            background: "#00000005",
            borderRight: "1px solid rgba(5, 5, 5, 0.06)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              margin: "15px 0",
              fontSize: "11pt",
            }}
          >
            <b>Account Configuration</b>
          </div>
          <Menu
            onClick={(e) => {
              console.log("click ", e.key);
              handle_select(e.key);
            }}
            selectedKeys={[active_page]}
            mode="vertical"
            items={tabs}
            style={{ width: 175, background: "#00000005", height: "100vh" }}
          />
        </div>
        <div
          className="smc-vfill"
          style={{ overflow: "auto", paddingLeft: "15px" }}
        >
          <Flex style={{ marginTop: "5px" }}>
            <h2>{titles[active_page]}</h2>
            <div style={{ flex: 1 }} />
            {renderExtraContent()}
          </Flex>
          {children[active_page]}
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div
      className="smc-vfill"
      style={{ overflow: "auto", paddingRight: "15px" }}
    >
      {is_logged_in && !get_api_key ? (
        render_logged_in_view()
      ) : (
        <RedirectToNextApp />
      )}
    </div>
  );
};

function RedirectToNextApp({}) {
  const isMountedRef = useIsMountedRef();

  useEffect(() => {
    const f = () => {
      if (isMountedRef.current) {
        // didn't get signed in so go to landing page
        window.location.href = appBasePath;
      }
    };
    setTimeout(f, 5000);
  }, []);

  return <Loading theme="medium" />;
}
