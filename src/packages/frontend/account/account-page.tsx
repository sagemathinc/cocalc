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
import { Space } from "antd";
import { useIntl } from "react-intl";
import { SignOut } from "@cocalc/frontend/account/sign-out";
import { AntdTabItem, Col, Row, Tabs } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  redux,
  useTypedRedux,
  useWindowDimensions,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { cloudFilesystemsEnabled } from "@cocalc/frontend/compute";
import CloudFilesystems from "@cocalc/frontend/compute/cloud-filesystem/cloud-filesystems";
import { labels } from "@cocalc/frontend/i18n";
import PurchasesPage from "@cocalc/frontend/purchases/purchases-page";
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
import { SSHKeysPage } from "./ssh-keys/global-ssh-keys";
import { UpgradesPage } from "./upgrades/upgrades-page";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export const AccountPage: React.FC = () => {
  const intl = useIntl();

  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > 800;

  const active_page = useTypedRedux("account", "active_page");
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const account_id = useTypedRedux("account", "account_id");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const kucalc = useTypedRedux("customize", "kucalc");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
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
          <Icon name="wrench" /> {intl.formatMessage(labels.preferences)}
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
            <Icon name="money" /> {intl.formatMessage(labels.purchases)}
          </span>
        ),
        children: active_page === "purchases" && <PurchasesPage />,
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
      items.push({
        key: "statements",
        label: (
          <span>
            <Icon name="money" /> {intl.formatMessage(labels.statements)}
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
            <Icon name="key" /> {intl.formatMessage(labels.licenses)}
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
            <Icon name="key" /> {intl.formatMessage(labels.ssh_keys)}
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
    if (is_commercial && kucalc === KUCALC_COCALC_COM) {
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
    if (cloudFilesystemsEnabled()) {
      items.push({
        key: "cloud-filesystems",
        label: (
          <>
            <Icon name="disk-round" />{" "}
            {intl.formatMessage(labels.cloud_file_system)}
          </>
        ),
        children: <CloudFilesystems />,
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

    return (
      <Row>
        <Col md={12}>
          <Tabs
            activeKey={active_page ?? "account"}
            onSelect={handle_select}
            animation={false}
            tabBarExtraContent={renderExtraContent()}
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
      {is_logged_in && !get_api_key ? (
        render_logged_in_view()
      ) : (
        <RedirectToNextApp />
      )}
    </div>
  );
};

function RedirectToNextApp({}) {
  useEffect(() => {
    window.location.href = appBasePath;
  }, []);

  return null;
}
