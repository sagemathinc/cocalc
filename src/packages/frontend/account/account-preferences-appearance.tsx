/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Slider } from "antd";
import { debounce } from "lodash";
import { ReactElement, useMemo } from "react";
import { FormattedMessage, defineMessages, useIntl } from "react-intl";

import { Checkbox, Panel } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { DARK_MODE_ICON } from "@cocalc/util/consts/ui";
import { DARK_MODE_DEFAULTS } from "@cocalc/util/db-schema/accounts";
import {
  DARK_MODE_KEYS,
  DARK_MODE_MINS,
  get_dark_mode_config,
} from "./dark-mode";
import { OtherSettings } from "./other-settings";
import { TerminalSettings } from "./terminal-settings";

// Icon constant for account preferences section
export const APPEARANCE_ICON_NAME = "eye";

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
  const other_settings = useTypedRedux("account", "other_settings");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const kucalc = useTypedRedux("customize", "kucalc");

  function on_change(name: string, value: any): void {
    redux.getActions("account").set_other_settings(name, value);
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

  function renderDarkModePanel(): ReactElement {
    const checked = !!other_settings.get("dark_mode");
    const config = get_dark_mode_config(other_settings.toJS());
    return (
      <Panel
        header={
          <div
            style={{
              color: "rgba(229, 224, 216)",
              backgroundColor: "rgb(36, 37, 37)",
              padding: "5px 10px",
              borderRadius: "3px",
              display: "inline-block",
            }}
          >
            <Icon unicode={DARK_MODE_ICON} /> Dark Mode
          </div>
        }
      >
        <div>
          <Checkbox
            checked={checked}
            onChange={(e) => on_change("dark_mode", e.target.checked)}
            style={{
              color: "rgba(229, 224, 216)",
              backgroundColor: "rgb(36, 37, 37)",
              marginLeft: "-5px",
              padding: "5px",
              borderRadius: "3px",
            }}
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
          </Checkbox>
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

  return (
    <>
      <OtherSettings
        other_settings={other_settings}
        is_stripe_customer={
          !!stripe_customer?.getIn(["subscriptions", "total_count"])
        }
        kucalc={kucalc}
        mode="appearance"
      />
      {renderDarkModePanel()}
      <TerminalSettings />
    </>
  );
}
