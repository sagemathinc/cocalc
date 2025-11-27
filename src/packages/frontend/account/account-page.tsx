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

// cSpell:ignore payg

import type {
  PreferencesSubTabKey,
  PreferencesSubTabType,
} from "@cocalc/util/types/settings";

import { Button, Flex, Menu, Space } from "antd";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { SignOut } from "@cocalc/frontend/account/sign-out";
import {
  React,
  redux,
  useIsMountedRef,
  useTypedRedux,
  useWindowDimensions,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, Loading, Title } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { cloudFilesystemsEnabled } from "@cocalc/frontend/compute";
import CloudFilesystems from "@cocalc/frontend/compute/cloud-filesystem/cloud-filesystems";
import { Footer } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import BalanceButton from "@cocalc/frontend/purchases/balance-button";
import PayAsYouGoPage from "@cocalc/frontend/purchases/payg-page";
import PaymentMethodsPage from "@cocalc/frontend/purchases/payment-methods-page";
import PaymentsPage from "@cocalc/frontend/purchases/payments-page";
import PurchasesPage from "@cocalc/frontend/purchases/purchases-page";
import StatementsPage from "@cocalc/frontend/purchases/statements-page";
import SubscriptionsPage from "@cocalc/frontend/purchases/subscriptions-page";
import { SupportTickets } from "@cocalc/frontend/support";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { COLORS } from "@cocalc/util/theme";
import { VALID_PREFERENCES_SUB_TYPES } from "@cocalc/util/types/settings";
import { AccountPreferencesAI } from "./account-preferences-ai";
import {
  AccountPreferencesAppearance,
  APPEARANCE_ICON_NAME,
} from "./account-preferences-appearance";
import {
  AccountPreferencesCommunication,
  COMMUNICATION_ICON_NAME,
} from "./account-preferences-communication";
import {
  AccountPreferencesEditor,
  EDITOR_ICON_NAME,
} from "./account-preferences-editor";
import {
  AccountPreferencesKeyboard,
  KEYBOARD_ICON_NAME,
} from "./account-preferences-keyboard";
import {
  AccountPreferencesOther,
  OTHER_ICON_NAME,
} from "./account-preferences-other";
import {
  ACCOUNT_PREFERENCES_ICON_NAME,
  ACCOUNT_PROFILE_ICON_NAME,
  AccountPreferencesProfile,
} from "./account-preferences-profile";
import {
  AccountPreferencesSecurity,
  KEYS_ICON_NAME,
} from "./account-preferences-security";
import { I18NSelector } from "./i18n-selector";
import { LicensesPage } from "./licenses/licenses-page";
import { PublicPaths } from "./public-paths/public-paths";
import { SettingsOverview } from "./settings-index";
import { UpgradesPage } from "./upgrades/upgrades-page";

export const ACCOUNT_SETTINGS_ICON_NAME: IconName = "settings";

const BILLING_MENU_KEYS = new Set([
  "subscriptions",
  "licenses",
  "payg",
  "upgrades",
  "purchases",
  "payments",
  "payment-methods",
  "statements",
]);

function getParentMenuKey(key?: string): string | undefined {
  if (!key) return;
  if (BILLING_MENU_KEYS.has(key)) return "billing";
  const dashIndex = key.indexOf("-");
  if (dashIndex === -1) return;
  return key.slice(0, dashIndex);
}

// Type for valid menu keys
type MenuKey =
  | "settings"
  | "billing"
  | "support"
  | "signout"
  | "profile"
  | PreferencesSubTabKey
  | string;

// Utility function to safely create preferences sub-tab key
function createPreferencesSubTabKey(
  subTab: string,
): PreferencesSubTabKey | null {
  if (VALID_PREFERENCES_SUB_TYPES.includes(subTab as PreferencesSubTabType)) {
    const validSubTab = subTab as PreferencesSubTabType;
    return `preferences-${validSubTab}`;
  }
  return null;
}

// give up on trying to load account info and redirect to landing page.
// Do NOT make too short, since loading account info might takes ~10 seconds, e,g., due
// to slow network or some backend failure that times and retires involving
// changefeeds.
const LOAD_ACCOUNT_INFO_TIMEOUT = 15_000;

export const AccountPage: React.FC = () => {
  const intl = useIntl();
  const [hidden, setHidden] = useState(IS_MOBILE);
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > 800;

  const active_page = useTypedRedux("account", "active_page") ?? "index";
  const active_sub_tab =
    useTypedRedux("account", "active_sub_tab") ??
    (active_page === "preferences"
      ? ("preferences-appearance" as PreferencesSubTabKey)
      : undefined);
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const account_id = useTypedRedux("account", "account_id");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const kucalc = useTypedRedux("customize", "kucalc");
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const get_api_key = useTypedRedux("page", "get_api_key");

  function handle_select(key: MenuKey): void {
    switch (key) {
      case "settings":
        // Handle settings overview page
        redux.getActions("account").setState({
          active_page: "index",
          active_sub_tab: undefined,
        });
        redux.getActions("account").push_state(`/settings/index`);
        return;
      case "billing":
        redux.getActions("billing").update_customer();
        break;
      case "support":
        break;
      case "signout":
        return;
      case "profile":
        // Handle profile as standalone page
        redux.getActions("account").setState({
          active_page: "profile",
          active_sub_tab: undefined,
        });
        redux.getActions("account").push_state(`/profile`);
        return;
    }

    // Handle sub-tabs under preferences
    if (typeof key === "string" && key.startsWith("preferences-")) {
      const subTab = key.replace("preferences-", "");
      const subTabKey = createPreferencesSubTabKey(subTab);
      if (subTabKey) {
        redux.getActions("account").setState({
          active_sub_tab: subTabKey,
          active_page: "preferences",
        });
        // Update URL to settings/preferences/[sub-tab]
        redux.getActions("account").push_state(`/preferences/${subTab}`);
      }
      return;
    }

    redux.getActions("account").set_active_tab(key);
    redux.getActions("account").push_state(`/${key}`);
  }

  function getTabs(): any[] {
    const items: any[] = [
      {
        key: "index",
        label: (
          <span style={{ fontWeight: "bold" }}>
            <Icon name={ACCOUNT_SETTINGS_ICON_NAME} />{" "}
            {intl.formatMessage(labels.settings)}
          </span>
        ),
        children: active_page === "index" && <SettingsOverview />,
      },
      // Profile as second item
      {
        key: "profile",
        label: (
          <span>
            <Icon name={ACCOUNT_PROFILE_ICON_NAME} />{" "}
            {intl.formatMessage(labels.profile)}
          </span>
        ),
        children: active_page === "profile" && <AccountPreferencesProfile />,
      },
      // Preferences submenu
      {
        key: "preferences",
        label: (
          <span>
            <Icon name={ACCOUNT_PREFERENCES_ICON_NAME} />{" "}
            {intl.formatMessage(labels.preferences)}
          </span>
        ),
        children: [
          {
            key: "preferences-appearance",
            label: (
              <span>
                <Icon name={APPEARANCE_ICON_NAME} />{" "}
                {intl.formatMessage(labels.appearance)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-appearance" && (
                <AccountPreferencesAppearance />
              ),
          },
          {
            key: "preferences-editor",
            label: (
              <span>
                <Icon name={EDITOR_ICON_NAME} />{" "}
                {intl.formatMessage(labels.editor)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-editor" && (
                <AccountPreferencesEditor />
              ),
          },
          {
            key: "preferences-keyboard",
            label: (
              <span>
                <Icon name={KEYBOARD_ICON_NAME} />{" "}
                {intl.formatMessage(labels.keyboard)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-keyboard" && (
                <AccountPreferencesKeyboard />
              ),
          },
          {
            key: "preferences-ai",
            label: (
              <span>
                <AIAvatar size={16} style={{ top: "-5px" }} />{" "}
                {intl.formatMessage(labels.ai)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-ai" && <AccountPreferencesAI />,
          },
          {
            key: "preferences-communication",
            label: (
              <span>
                <Icon name={COMMUNICATION_ICON_NAME} />{" "}
                {intl.formatMessage(labels.communication)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-communication" && (
                <AccountPreferencesCommunication />
              ),
          },
          {
            key: "preferences-keys",
            label: (
              <span>
                <Icon name={KEYS_ICON_NAME} />{" "}
                {intl.formatMessage(labels.ssh_and_api_keys)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-keys" && (
                <AccountPreferencesSecurity />
              ),
          },
          {
            key: "preferences-other",
            label: (
              <span>
                <Icon name={OTHER_ICON_NAME} />{" "}
                {intl.formatMessage(labels.other)}
              </span>
            ),
            children: active_page === "preferences" &&
              active_sub_tab === "preferences-other" && (
                <AccountPreferencesOther />
              ),
          },
        ],
      },
    ];
    // adds a few conditional tabs
    if (is_anonymous) {
      // None of the rest make any sense for a temporary anonymous account.
      return items;
    }
    items.push({ type: "divider" });

    if (is_commercial) {
      const billingChildren = [
        {
          key: "subscriptions",
          label: (
            <span>
              <Icon name="calendar" />{" "}
              {intl.formatMessage(labels.subscriptions)}
            </span>
          ),
          children: active_page === "subscriptions" && <SubscriptionsPage />,
        },
        {
          key: "licenses",
          label: (
            <span>
              <Icon name="key" /> {intl.formatMessage(labels.licenses)}
            </span>
          ),
          children: active_page === "licenses" && <LicensesPage />,
        },
        {
          key: "payg",
          label: (
            <span>
              <Icon name="line-chart" />{" "}
              {intl.formatMessage(labels.pay_as_you_go)}
            </span>
          ),
          children: active_page === "payg" && <PayAsYouGoPage />,
        },
        ...(is_commercial && kucalc === KUCALC_COCALC_COM
          ? [
              {
                key: "upgrades",
                label: (
                  <span>
                    <Icon name="arrow-circle-up" />{" "}
                    {intl.formatMessage(labels.upgrades)}
                  </span>
                ),
                children: active_page === "upgrades" && <UpgradesPage />,
              },
            ]
          : []),
        {
          key: "purchases",
          label: (
            <span>
              <Icon name="money-check" />{" "}
              {intl.formatMessage(labels.purchases)}
            </span>
          ),
          children: active_page === "purchases" && <PurchasesPage />,
        },
        {
          key: "payments",
          label: (
            <span>
              <Icon name="credit-card" />{" "}
              {intl.formatMessage(labels.payments)}
            </span>
          ),
          children: active_page === "payments" && <PaymentsPage />,
        },
        {
          key: "payment-methods",
          label: (
            <span>
              <Icon name="credit-card" />{" "}
              {intl.formatMessage(labels.payment_methods)}
            </span>
          ),
          children: active_page === "payment-methods" && (
            <PaymentMethodsPage />
          ),
        },
        {
          key: "statements",
          label: (
            <span>
              <Icon name="calendar-week" />{" "}
              {intl.formatMessage(labels.statements)}
            </span>
          ),
          children: active_page === "statements" && <StatementsPage />,
        },
      ];

      items.push({
        key: "billing",
        label: (
          <span>
            <Icon name="money-check" /> {intl.formatMessage(labels.billing)}
          </span>
        ),
        children: billingChildren,
      });
      items.push({ type: "divider" });
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

    if (
      kucalc === KUCALC_COCALC_COM ||
      kucalc === KUCALC_ON_PREMISES ||
      is_commercial
    ) {
    }

    if (is_commercial) {
      items.push({ type: "divider" });
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

    return items;
  }

  const tabs = getTabs();

  useEffect(() => {
    const parentKey = getParentMenuKey(
      active_sub_tab ? active_sub_tab : active_page,
    );
    setOpenKeys((prevOpenKeys) =>
      parentKey == null
        ? []
        : prevOpenKeys.length === 1 && prevOpenKeys[0] === parentKey
          ? prevOpenKeys
          : [parentKey],
    );
  }, [active_page, active_sub_tab]);

  useEffect(() => {
    if (active_page !== "preferences" && active_sub_tab) {
      redux.getActions("account").setState({ active_sub_tab: undefined });
    }
  }, [active_page, active_sub_tab]);

  function handleOpenChange(keys: string[]) {
    setOpenKeys((prevOpenKeys) => {
      const newlyOpened = keys.find((key) => !prevOpenKeys.includes(key));
      return newlyOpened ? [newlyOpened] : [];
    });
  }

  // Process tabs to handle nested children for sub-tabs
  const children = {};
  const titles = {}; // Always store full labels for renderTitle()
  for (const tab of tabs) {
    if (tab.type == "divider") {
      continue;
    }
    if (tab.key === "preferences" && Array.isArray(tab.children)) {
      // Handle sub-tabs for preferences
      const subTabs = tab.children;
      tab.children = subTabs.map((subTab) => {
        // Extract just the icon (first child) from the span when hidden
        const label = hidden ? (
          <span style={{ paddingLeft: "5px" }}>
            {subTab.label.props.children[0]}
          </span>
        ) : (
          subTab.label
        );
        return {
          key: subTab.key,
          label,
        };
      });
      // Store sub-tab children and full labels
      for (const subTab of subTabs) {
        children[subTab.key] = subTab.children;
        titles[subTab.key] = subTab.label; // Always store original full label
      }
    } else if (tab.key === "billing" && Array.isArray(tab.children)) {
      const subTabs = tab.children;
      tab.children = subTabs.map((subTab) => {
        const label = hidden ? (
          <span style={{ paddingLeft: "5px" }}>
            {subTab.label.props.children[0]}
          </span>
        ) : (
          subTab.label
        );
        return {
          key: subTab.key,
          label,
        };
      });
      for (const subTab of subTabs) {
        children[subTab.key] = subTab.children;
        titles[subTab.key] = subTab.label;
      }
    } else if (tab.key === "settings" || tab.key === "profile") {
      // Handle settings and profile as top-level pages
      // Store original full label for renderTitle()
      const originalLabel = tab.label;
      // Extract just the icon (first child) from the span when hidden
      tab.label = hidden ? (
        <span style={{ paddingLeft: "5px" }}>
          {tab.label.props.children[0]}
        </span>
      ) : (
        tab.label
      );
      children[tab.key] = tab.children;
      titles[tab.key] = originalLabel; // Store original label
      delete tab.children;
    } else {
      // Store original full label for renderTitle()
      const originalLabel = tab.label;
      // Extract just the icon (first child) from the span when hidden
      tab.label = hidden ? (
        <span style={{ paddingLeft: "5px" }}>
          {tab.label.props.children[0]}
        </span>
      ) : (
        tab.label
      );
      children[tab.key] = tab.children;
      titles[tab.key] = originalLabel; // Store original label
      delete tab.children;
    }
  }

  function renderTitle() {
    return (
      <Title level={3}>
        {active_page === "preferences" && active_sub_tab
          ? titles[active_sub_tab]
          : titles[active_page]}
      </Title>
    );
  }

  function renderExtraContent() {
    return (
      <Space>
        {is_commercial ? <BalanceButton /> : undefined}
        <I18NSelector isWide={isWide} />
        <SignOut everywhere={false} highlight={true} narrow={!isWide} />
      </Space>
    );
  }

  function render_logged_in_view(): React.JSX.Element {
    if (!account_id) {
      return (
        <div style={{ textAlign: "center", paddingTop: "15px" }}>
          <Loading theme={"medium"} />
        </div>
      );
    }
    if (is_anonymous) {
      return (
        <div
          style={{
            margin: "15px  0 0 0",
            padding: "0 10% 0 10%",
            overflow: "auto",
          }}
        >
          <AccountPreferencesProfile />
        </div>
      );
    }

    function handleHideToggle() {
      setHidden(!hidden);
    }

    return (
      <div className="smc-vfill" style={{ flexDirection: "row" }}>
        <div
          style={{
            background: "#00000005",
            borderRight: "1px solid rgba(5, 5, 5, 0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Menu
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
            mode="inline"
            items={tabs}
            onClick={(e) => {
              handle_select(e.key);
            }}
            selectedKeys={
              active_sub_tab ? [active_page, active_sub_tab] : [active_page]
            }
            inlineIndent={hidden ? 0 : 24}
            style={{
              width: hidden ? 50 : 200,
              background: "#00000005",
              flex: "1 1 auto",
              overflowY: "auto",
              minHeight: 0,
              borderBottom: `1px solid ${COLORS.GRAY_DDD}`,
            }}
          />
          <Button
            block
            size="small"
            type="text"
            style={{
              flex: "0 0 auto",
              minHeight: 0,
              textAlign: "left",
              padding: "15px 0",
              color: COLORS.GRAY_M,
            }}
            onClick={handleHideToggle}
            icon={
              <Icon
                name={
                  hidden ? "vertical-left-outlined" : "vertical-right-outlined"
                }
              />
            }
          >
            {hidden ? "" : "Hide"}
          </Button>
        </div>
        <div
          className="smc-vfill"
          style={{
            overflow: "auto",
            paddingLeft: "15px",
            paddingRight: "15px",
          }}
        >
          <Flex style={{ marginTop: "5px" }} wrap>
            {renderTitle()}
            <div style={{ flex: 1 }} />
            {renderExtraContent()}
          </Flex>
          {active_page === "preferences" && active_sub_tab
            ? children[active_sub_tab]
            : children[active_page]}
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="smc-vfill">
      {is_logged_in && !get_api_key ? (
        render_logged_in_view()
      ) : (
        <RedirectToNextApp />
      )}
    </div>
  );
};

declare var DEBUG;

function RedirectToNextApp({}) {
  const isMountedRef = useIsMountedRef();

  useEffect(() => {
    const f = () => {
      if (isMountedRef.current && !DEBUG) {
        // didn't get signed in so go to landing page
        window.location.href = appBasePath;
      }
    };
    setTimeout(f, LOAD_ACCOUNT_INFO_TIMEOUT);
  }, []);

  return <Loading theme="medium" />;
}
