/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Segmented } from "antd";
import { ReactElement } from "react";
import { FormattedMessage, defineMessages, useIntl } from "react-intl";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, HelpIcon, Icon, IconName, LabeledRow } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { A11Y, ACCESSIBILITY_ICON, DARK_MODE_ICON } from "@cocalc/util/consts/ui";
import { DEFAULT_EDITOR_THEME } from "@cocalc/util/db-schema/accounts";
import {
  COLORS,
  type NativeDarkMode,
  OTHER_SETTINGS_NATIVE_DARK_MODE,
} from "@cocalc/util/theme";
import { ColorThemeSelector } from "./color-theme-selector";
import { EditorSettingsColorScheme } from "./editor-settings/color-schemes";
import { I18NSelector, I18N_MESSAGE, I18N_TITLE } from "./i18n-selector";
import { TerminalSettings } from "./terminal-settings";

// Icon constant for account preferences section
export const APPEARANCE_ICON_NAME: IconName = "eye";

// See https://github.com/sagemathinc/cocalc/issues/5620
// There are weird bugs with relying only on mathjax, whereas our
// implementation of katex with a fallback to mathjax works very well.
// This makes it so katex can't be disabled.
const ALLOW_DISABLE_KATEX = false;

export function katexIsEnabled() {
  if (!ALLOW_DISABLE_KATEX) {
    return true;
  }
  return redux.getStore("account")?.getIn(["other_settings", "katex"]) ?? true;
}

const DARK_MODE_MESSAGES = defineMessages({
  title: {
    id: "account.appearance.dark_mode.title",
    defaultMessage: "Dark Mode",
  },
  description: {
    id: "account.appearance.dark_mode.description",
    defaultMessage:
      "Automatically derives a dark variant from the selected color theme. 'System' follows your OS light/dark preference. Editor and terminal themes switch automatically.",
  },
  off: {
    id: "account.appearance.dark_mode.off",
    defaultMessage: "Off",
  },
  system: {
    id: "account.appearance.dark_mode.system",
    defaultMessage: "System",
  },
  always: {
    id: "account.appearance.dark_mode.always",
    defaultMessage: "Always",
  },
});

const ACCESSIBILITY_MESSAGES = defineMessages({
  title: {
    id: "account.appearance.accessibility.title",
    defaultMessage: "Accessibility",
  },
  enabled: {
    id: "account.appearance.accessibility.enabled",
    defaultMessage:
      "<strong>Enable Accessibility Mode:</strong> optimize the user interface for accessibility features",
  },
});

export function AccountPreferencesAppearance() {
  const intl = useIntl();
  const other_settings = useTypedRedux("account", "other_settings");
  const editor_settings = useTypedRedux("account", "editor_settings");
  const font_size = useTypedRedux("account", "font_size");

  function on_change(name: string, value: any): void {
    redux.getActions("account").set_other_settings(name, value);
  }

  function on_change_editor_settings(name: string, value: any): void {
    redux.getActions("account").set_editor_settings(name, value);
  }

  function render_katex() {
    if (!ALLOW_DISABLE_KATEX) {
      return null;
    }
    return (
      <Switch
        checked={!!other_settings.get("katex")}
        onChange={(e) => on_change("katex", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.katex"
          defaultMessage={`<strong>KaTeX:</strong> attempt to render formulas
              using {katex} (much faster, but missing context menu options)`}
          values={{ katex: <A href={"https://katex.org/"}>KaTeX</A> }}
        />
      </Switch>
    );
  }

  // This standalone Dark Mode panel duplicates the toggle inside ColorThemeSelector
  // on purpose: users who previously relied on a dedicated dark-mode section should
  // still find it here so they are not disoriented. Both controls write the same
  // setting (OTHER_SETTINGS_NATIVE_DARK_MODE), so they always stay in sync.
  function renderDarkModePanel(): ReactElement {
    const nativeDarkMode = String(
      other_settings?.get(OTHER_SETTINGS_NATIVE_DARK_MODE) ?? "off",
    ) as NativeDarkMode;

    return (
      <Panel
        size="small"
        header={
          <>
            <Icon unicode={DARK_MODE_ICON} />{" "}
            {intl.formatMessage(DARK_MODE_MESSAGES.title)}
          </>
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <Segmented
            size="small"
            value={nativeDarkMode}
            onChange={(val) => on_change(OTHER_SETTINGS_NATIVE_DARK_MODE, val)}
            options={[
              {
                label: intl.formatMessage(DARK_MODE_MESSAGES.off),
                value: "off",
              },
              {
                label: intl.formatMessage(DARK_MODE_MESSAGES.system),
                value: "system",
              },
              {
                label: intl.formatMessage(DARK_MODE_MESSAGES.always),
                value: "on",
              },
            ]}
          />
        </div>
        <div style={{ fontSize: 12, color: COLORS.GRAY }}>
          {intl.formatMessage(DARK_MODE_MESSAGES.description)}
        </div>
      </Panel>
    );
  }

  function getAccessibilitySettings(): { enabled: boolean } {
    const settingsStr = other_settings.get(A11Y);
    if (!settingsStr) {
      return { enabled: false };
    }
    try {
      return JSON.parse(settingsStr);
    } catch {
      return { enabled: false };
    }
  }

  function setAccessibilitySettings(settings: { enabled: boolean }): void {
    on_change(A11Y, JSON.stringify(settings));
  }

  function renderAccessibilityPanel(): ReactElement {
    const settings = getAccessibilitySettings();
    return (
      <Panel
        size="small"
        header={
          <>
            <Icon unicode={ACCESSIBILITY_ICON} />{" "}
            {intl.formatMessage(ACCESSIBILITY_MESSAGES.title)}
          </>
        }
      >
        <Switch
          checked={settings.enabled}
          onChange={(e) =>
            setAccessibilitySettings({ ...settings, enabled: e.target.checked })
          }
        >
          <FormattedMessage {...ACCESSIBILITY_MESSAGES.enabled} />
        </Switch>
      </Panel>
    );
  }

  function renderUserInterfacePanel(): ReactElement {
    return (
      <Panel
        size="small"
        header={
          <>
            <Icon name="desktop" />{" "}
            <FormattedMessage
              id="account.appearance.user_interface.title"
              defaultMessage="User Interface"
            />
          </>
        }
      >
        <LabeledRow
          label={
            <>
              <Icon name="translation-outlined" />{" "}
              {intl.formatMessage(labels.language)}
            </>
          }
        >
          <div>
            <I18NSelector />{" "}
            <HelpIcon title={intl.formatMessage(I18N_TITLE)}>
              {intl.formatMessage(I18N_MESSAGE)}
            </HelpIcon>
          </div>
        </LabeledRow>
        <Switch
          checked={!!other_settings.get("hide_file_popovers")}
          onChange={(e) => on_change("hide_file_popovers", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.file_popovers"
            defaultMessage={`<strong>Hide File Tab Popovers:</strong>
            do not show the popovers over file tabs`}
          />
        </Switch>
        <Switch
          checked={!!other_settings.get("hide_project_popovers")}
          onChange={(e) => on_change("hide_project_popovers", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.project_popovers"
            defaultMessage={`<strong>Hide Project Tab Popovers:</strong>
            do not show the popovers over the project tabs`}
          />
        </Switch>
        <Switch
          checked={!!other_settings.get("hide_button_tooltips")}
          onChange={(e) => on_change("hide_button_tooltips", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.button_tooltips"
            defaultMessage={`<strong>Hide Button Tooltips:</strong>
            hides some button tooltips (this is only partial)`}
          />
        </Switch>
        <Switch
          checked={!!other_settings.get("time_ago_absolute")}
          onChange={(e) => on_change("time_ago_absolute", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.time_ago_absolute"
            defaultMessage={`<strong>Display Timestamps as absolute points in time</strong>
            instead of relative to the current time`}
          />
        </Switch>
        <Switch
          checked={!!other_settings.get("hide_navbar_balance")}
          onChange={(e) => on_change("hide_navbar_balance", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.hide_navbar_balance"
            defaultMessage={`<strong>Hide Account Balance</strong> in navigation bar`}
          />
        </Switch>
        {render_katex()}
      </Panel>
    );
  }

  return (
    <>
      {renderUserInterfacePanel()}
      <ColorThemeSelector />
      {renderAccessibilityPanel()}
      {renderDarkModePanel()}
      <EditorSettingsColorScheme
        size="small"
        theme={editor_settings?.get("theme") ?? DEFAULT_EDITOR_THEME}
        on_change={(value) => on_change_editor_settings("theme", value)}
        editor_settings={editor_settings}
        font_size={font_size}
      />
      <TerminalSettings />
    </>
  );
}
