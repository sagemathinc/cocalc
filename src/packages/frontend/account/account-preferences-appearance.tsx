/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Flex, Form, Switch, Tooltip } from "antd";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import track from "@cocalc/frontend/user-tracking";
import { OtherSettings } from "./other-settings";
import { TerminalSettings } from "./terminal-settings";

export function AccountPreferencesAppearance() {
  const other_settings = useTypedRedux("account", "other_settings");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const kucalc = useTypedRedux("customize", "kucalc");

  function renderDarkMode() {
    return (
      <Tooltip title="Enable dark mode across the entire user interface. See further dark mode configuration below.">
        <Form style={{ height: "37px" }}>
          <Form.Item
            label={
              <div
                onClick={() => {
                  redux
                    .getActions("account")
                    .set_other_settings(
                      "dark_mode",
                      !other_settings.get("dark_mode"),
                    );
                }}
                style={{
                  cursor: "pointer",
                  color: "rgba(229, 224, 216)",
                  backgroundColor: "rgb(36, 37, 37)",
                  padding: "5px 10px",
                  borderRadius: "3px",
                }}
              >
                Dark Mode
              </div>
            }
          >
            <Switch
              checked={other_settings.get("dark_mode")}
              onChange={(checked) => {
                redux
                  .getActions("account")
                  .set_other_settings("dark_mode", checked);
                track("dark-mode", { how: "settings page", checked });
              }}
            />
          </Form.Item>
        </Form>
      </Tooltip>
    );
  }

  return (
    <>
      <Flex>
        <div style={{ flex: 1 }} />
        {renderDarkMode()}
      </Flex>
      <OtherSettings
        other_settings={other_settings}
        is_stripe_customer={
          !!stripe_customer?.getIn(["subscriptions", "total_count"])
        }
        kucalc={kucalc}
        mode="appearance"
      />
      <TerminalSettings />
    </>
  );
}
