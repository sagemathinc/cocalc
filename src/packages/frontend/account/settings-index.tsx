/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore payg

import { Card, Divider, Flex } from "antd";
import { defineMessages, useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { cloudFilesystemsEnabled } from "@cocalc/frontend/compute";
import { labels } from "@cocalc/frontend/i18n";
import { APPEARANCE_ICON_NAME } from "./account-preferences-appearance";
import { EDITOR_ICON_NAME } from "./account-preferences-editor";
import { KEYBOARD_ICON_NAME } from "./account-preferences-keyboard";
import { OTHER_ICON_NAME } from "./account-preferences-other";
import {
  ACCOUNT_PREFERENCES_ICON_NAME,
  ACCOUNT_PROFILE_ICON_NAME,
} from "./account-preferences-profile";
import { KEYS_ICON_NAME } from "./account-preferences-security";

const messages = defineMessages({
  title: {
    id: "account.settings.overview.title",
    defaultMessage: "Settings Overview",
  },
  profile: {
    id: "account.settings.overview.profile",
    defaultMessage:
      "Manage your personal information, avatar, and account details.",
  },
  preferences: {
    id: "account.settings.overview.preferences",
    defaultMessage:
      "Customize your experience by configuring the appearance, editor settings, and other preferences.",
  },
  appearance: {
    id: "account.settings.overview.appearance",
    defaultMessage:
      "Customize the visual experience via color themes, dark mode, language, and visual settings.",
  },
  editor: {
    id: "account.settings.overview.editor",
    defaultMessage:
      "Customize code editor behavior, fonts, indentation, and display options.",
  },
  keyboard: {
    id: "account.settings.overview.keyboard",
    defaultMessage: "Keyboard shortcuts and input method preferences.",
  },
  ai: {
    id: "account.settings.overview.ai",
    defaultMessage: "Configure AI assistant settings and integrations.",
  },
  keys: {
    id: "account.settings.overview.keys",
    defaultMessage: "Manage API keys and setup SSH keys.",
  },
  other: {
    id: "account.settings.overview.other",
    defaultMessage: "Additional miscellaneous settings and options.",
  },
  billing: {
    id: "account.settings.overview.billing",
    defaultMessage: "Manage subscriptions, licenses, and billing information.",
  },
  subscriptions: {
    id: "account.settings.overview.subscriptions",
    defaultMessage: "View and manage your active subscriptions.",
  },
  licenses: {
    id: "account.settings.overview.licenses",
    defaultMessage: "Manage software licenses and access permissions.",
  },
  payg: {
    id: "account.settings.overview.payg",
    defaultMessage: "Configure pay-as-you-go usage and billing.",
  },
  purchases: {
    id: "account.settings.overview.purchases",
    defaultMessage: "View purchase history and receipts.",
  },
  payments: {
    id: "account.settings.overview.payments",
    defaultMessage: "Manage payment methods and transaction history.",
  },
  statements: {
    id: "account.settings.overview.statements",
    defaultMessage: "View detailed billing statements and invoices.",
  },
  files: {
    id: "account.settings.overview.files",
    defaultMessage: "Manage published files and public sharing.",
  },
  cloud: {
    id: "account.settings.overview.cloud",
    defaultMessage: "Configure cloud file system connections.",
  },
  support: {
    id: "account.settings.overview.support",
    defaultMessage: "Access support tickets and help resources.",
  },
});

const CARD_PROPS = {
  size: "small" as const,
  hoverable: true,
  style: { width: 300, minWidth: 250 },
} as const;

const FLEX_PROPS = {
  wrap: true as const,
  gap: "15px",
  style: { marginBottom: "40px" },
} as const;

export function SettingsOverview() {
  const intl = useIntl();
  const is_commercial = useTypedRedux("customize", "is_commercial");

  const handleNavigate = (path: string) => {
    // Use the same navigation pattern as the account page
    const segments = path.split("/").filter(Boolean);
    if (segments[0] === "settings") {
      if (segments[1] === "profile") {
        redux.getActions("account").setState({
          active_page: "profile",
          active_sub_tab: undefined,
        });
        redux.getActions("account").push_state(`/profile`);
      } else if (segments[1] === "preferences" && segments[2]) {
        // Handle preferences sub-tabs
        const subTab = segments[2];
        const subTabKey = `preferences-${subTab}` as any;
        redux.getActions("account").setState({
          active_page: "preferences",
          active_sub_tab: subTabKey,
        });
        redux.getActions("account").push_state(`/preferences/${subTab}`);
      } else {
        // Handle other settings pages
        redux.getActions("account").set_active_tab(segments[1]);
        redux.getActions("account").push_state(`/${segments[1]}`);
      }
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <Divider plain>
        <Icon name={ACCOUNT_PROFILE_ICON_NAME} />{" "}
        {intl.formatMessage(labels.profile)} and{" "}
        <Icon name={ACCOUNT_PREFERENCES_ICON_NAME} />{" "}
        {intl.formatMessage(labels.preferences)}
      </Divider>
      <Flex {...FLEX_PROPS}>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/profile")}
        >
          <Card.Meta
            avatar={<Icon name={ACCOUNT_PROFILE_ICON_NAME} />}
            title={intl.formatMessage(labels.profile)}
            description={intl.formatMessage(messages.profile)}
          />
        </Card>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/preferences/appearance")}
        >
          <Card.Meta
            avatar={<Icon name={APPEARANCE_ICON_NAME} />}
            title={intl.formatMessage(labels.appearance)}
            description={intl.formatMessage(messages.appearance)}
          />
        </Card>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/preferences/editor")}
        >
          <Card.Meta
            avatar={<Icon name={EDITOR_ICON_NAME} />}
            title={intl.formatMessage(labels.editor)}
            description={intl.formatMessage(messages.editor)}
          />
        </Card>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/preferences/keyboard")}
        >
          <Card.Meta
            avatar={<Icon name={KEYBOARD_ICON_NAME} />}
            title={intl.formatMessage(labels.keyboard)}
            description={intl.formatMessage(messages.keyboard)}
          />
        </Card>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/preferences/ai")}
        >
          <Card.Meta
            avatar={<AIAvatar size={24} />}
            title={intl.formatMessage(labels.ai)}
            description={intl.formatMessage(messages.ai)}
          />
        </Card>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/preferences/keys")}
        >
          <Card.Meta
            avatar={<Icon name={KEYS_ICON_NAME} />}
            title={intl.formatMessage(labels.ssh_and_api_keys)}
            description={intl.formatMessage(messages.keys)}
          />
        </Card>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/preferences/other")}
        >
          <Card.Meta
            avatar={<Icon name={OTHER_ICON_NAME} />}
            title={intl.formatMessage(labels.other)}
            description={intl.formatMessage(messages.other)}
          />
        </Card>
      </Flex>

      {is_commercial && (
        <>
          <Divider plain>
            <Icon name="money-check" /> {intl.formatMessage(labels.billing)}
          </Divider>
          <Flex {...FLEX_PROPS}>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/subscriptions")}
            >
              <Card.Meta
                avatar={<Icon name="calendar" />}
                title={intl.formatMessage(labels.subscriptions)}
                description={intl.formatMessage(messages.subscriptions)}
              />
            </Card>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/licenses")}
            >
              <Card.Meta
                avatar={<Icon name="key" />}
                title={intl.formatMessage(labels.licenses)}
                description={intl.formatMessage(messages.licenses)}
              />
            </Card>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/payg")}
            >
              <Card.Meta
                avatar={<Icon name="line-chart" />}
                title={intl.formatMessage(labels.pay_as_you_go)}
                description={intl.formatMessage(messages.payg)}
              />
            </Card>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/purchases")}
            >
              <Card.Meta
                avatar={<Icon name="money-check" />}
                title={intl.formatMessage(labels.purchases)}
                description={intl.formatMessage(messages.purchases)}
              />
            </Card>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/payments")}
            >
              <Card.Meta
                avatar={<Icon name="credit-card" />}
                title={intl.formatMessage(labels.payments)}
                description={intl.formatMessage(messages.payments)}
              />
            </Card>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/statements")}
            >
              <Card.Meta
                avatar={<Icon name="calendar-week" />}
                title={intl.formatMessage(labels.statements)}
                description={intl.formatMessage(messages.statements)}
              />
            </Card>
          </Flex>
        </>
      )}

      <Divider plain>
        <Icon name="files" /> {intl.formatMessage(labels.files)}
      </Divider>
      <Flex {...FLEX_PROPS}>
        <Card
          {...CARD_PROPS}
          onClick={() => handleNavigate("settings/public-files")}
        >
          <Card.Meta
            avatar={<Icon name="share-square" />}
            title={intl.formatMessage(labels.published_files)}
            description={intl.formatMessage(messages.files)}
          />
        </Card>

        {cloudFilesystemsEnabled() && (
          <Card
            {...CARD_PROPS}
            onClick={() => handleNavigate("settings/cloud-filesystems")}
          >
            <Card.Meta
              avatar={<Icon name="server" />}
              title={intl.formatMessage(labels.cloud_file_system)}
              description={intl.formatMessage(messages.cloud)}
            />
          </Card>
        )}
      </Flex>

      {is_commercial && (
        <>
          <Divider plain>
            <Icon name="medkit" /> {intl.formatMessage(labels.support)}
          </Divider>
          <Flex {...FLEX_PROPS}>
            <Card
              {...CARD_PROPS}
              onClick={() => handleNavigate("settings/support")}
            >
              <Card.Meta
                avatar={<Icon name="medkit" />}
                title={intl.formatMessage(labels.support)}
                description={intl.formatMessage(messages.support)}
              />
            </Card>
          </Flex>
        </>
      )}
    </div>
  );
}
