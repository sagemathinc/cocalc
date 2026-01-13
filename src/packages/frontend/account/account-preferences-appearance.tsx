/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Slider } from "antd";
import { debounce } from "lodash";
import { ReactElement, useMemo } from "react";
import { FormattedMessage, defineMessages, useIntl } from "react-intl";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  A,
  HelpIcon,
  Icon,
  IconName,
  LabeledRow,
} from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { DARK_MODE_ICON } from "@cocalc/util/consts/ui";
import { DARK_MODE_DEFAULTS } from "@cocalc/util/db-schema/accounts";
import { COLORS } from "@cocalc/util/theme";
import {
  DARK_MODE_KEYS,
  DARK_MODE_MINS,
  get_dark_mode_config,
} from "./dark-mode";
import { EditorSettingsColorScheme } from "./editor-settings/color-schemes";
import { I18NSelector, I18N_MESSAGE, I18N_TITLE } from "./i18n-selector";
import { OtherSettings } from "./other-settings";
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

const DARK_MODE_LABELS = defineMessages({
  brightness: {
    id: "account.other-settings.theme.dark_mode.brightness",
    defaultMessage: "Brightness",
  },
  contrast: {
    id: "account.other-settings.theme.dark_mode.contrast",
    defaultMessage: "Contrast",
  },
  sepia: {
    id: "account.other-settings.theme.dark_mode.sepia",
    defaultMessage: "Sepia",
  },
});

export function AccountPreferencesAppearance() {
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const other_settings = useTypedRedux("account", "other_settings");
  const editor_settings = useTypedRedux("account", "editor_settings");
  const font_size = useTypedRedux("account", "font_size");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const kucalc = useTypedRedux("customize", "kucalc");

  function on_change(name: string, value: any): void {
    redux.getActions("account").set_other_settings(name, value);
  }

  function on_change_editor_settings(name: string, value: any): void {
    redux.getActions("account").set_editor_settings(name, value);
  }

  // Debounced version for dark mode sliders to reduce CPU usage
  const on_change_dark_mode = useMemo(
    () =>
      debounce((name: string, value: any) => on_change(name, value), 50, {
        trailing: true,
        leading: false,
      }),
    [],
  );

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

  function renderDarkModePanel(): ReactElement {
    const checked = !!other_settings.get("dark_mode");
    const config = get_dark_mode_config(other_settings.toJS());
    return (
      <Panel
        size="small"
        header={
          <>
            <Icon unicode={DARK_MODE_ICON} /> Dark Mode
          </>
        }
        styles={{
          header: {
            color: COLORS.GRAY_LLL,
            backgroundColor: COLORS.GRAY_DD,
          },
          body: {
            color: COLORS.GRAY_LLL,
            backgroundColor: COLORS.GRAY_D,
          },
        }}
      >
        <div>
          <Switch
            checked={checked}
            onChange={(e) => on_change("dark_mode", e.target.checked)}
            labelStyle={{ color: COLORS.GRAY_LLL }}
          >
            <FormattedMessage
              id="account.other-settings.theme.dark_mode.compact"
              defaultMessage={`Dark mode: reduce eye strain by showing a dark background (via {DR})`}
              values={{
                DR: (
                  <A
                    style={{ color: "#e96c4d", fontWeight: 700 }}
                    href="https://darkreader.org/"
                  >
                    DARK READER
                  </A>
                ),
              }}
            />
          </Switch>
          {checked ? (
            <Card
              size="small"
              title={
                <>
                  <Icon unicode={DARK_MODE_ICON} />{" "}
                  {intl.formatMessage({
                    id: "account.other-settings.theme.dark_mode.configuration",
                    defaultMessage: "Dark Mode Configuration",
                  })}
                </>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {DARK_MODE_KEYS.map((key) => (
                  <div
                    key={key}
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <div style={{ width: 100 }}>
                      {intl.formatMessage(DARK_MODE_LABELS[key])}
                    </div>
                    <Slider
                      min={DARK_MODE_MINS[key]}
                      max={100}
                      value={config[key]}
                      onChange={(x) =>
                        on_change_dark_mode(`dark_mode_${key}`, x)
                      }
                      marks={{
                        [DARK_MODE_DEFAULTS[key]]: String(
                          DARK_MODE_DEFAULTS[key],
                        ),
                      }}
                      style={{ flex: 1, width: 0 }}
                    />
                    <Button
                      size="small"
                      style={{ marginLeft: "20px" }}
                      onClick={() =>
                        on_change_dark_mode(
                          `dark_mode_${key}`,
                          DARK_MODE_DEFAULTS[key],
                        )
                      }
                    >
                      {intl.formatMessage(labels.reset)}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : undefined}
        </div>
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
            defaultMessage={`<strong>Hide {projectLabel} Tab Popovers:</strong>
            do not show the popovers over the {projectLabelLower} tabs`}
            values={{ projectLabel, projectLabelLower }}
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
      <OtherSettings
        other_settings={other_settings}
        is_stripe_customer={
          !!stripe_customer?.getIn(["subscriptions", "total_count"])
        }
        kucalc={kucalc}
        mode="appearance"
      />
      {renderDarkModePanel()}
      <EditorSettingsColorScheme
        size="small"
        theme={editor_settings?.get("theme") ?? "default"}
        on_change={(value) => on_change_editor_settings("theme", value)}
        editor_settings={editor_settings}
        font_size={font_size}
      />
      <TerminalSettings />
    </>
  );
}
