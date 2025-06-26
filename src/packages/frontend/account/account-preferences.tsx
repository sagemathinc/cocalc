/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Flex, Form, Switch, Tooltip } from "antd";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { EditorSettings } from "./editor-settings/editor-settings";
import { KeyboardSettings } from "./keyboard-settings";
import { OtherSettings } from "./other-settings";
import { ProfileSettings } from "./profile-settings";
import { AccountSettings } from "./settings/account-settings";
import ApiKeys from "./settings/api-keys";
import GlobalSSHKeys from "./ssh-keys/global-ssh-keys";
import TableError from "./table-error";
import { TerminalSettings } from "./terminal-settings";

export const AccountPreferences: React.FC = () => {
  const account_id = useTypedRedux("account", "account_id");
  const first_name = useTypedRedux("account", "first_name");
  const last_name = useTypedRedux("account", "last_name");
  const name = useTypedRedux("account", "name");
  const email_address = useTypedRedux("account", "email_address");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified",
  );
  const passports = useTypedRedux("account", "passports");
  const sign_out_error = useTypedRedux("account", "sign_out_error");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const created = useTypedRedux("account", "created");
  const strategies = useTypedRedux("account", "strategies");
  const unlisted = useTypedRedux("account", "unlisted");
  const email_enabled = useTypedRedux("customize", "email_enabled");
  const verify_emails = useTypedRedux("customize", "verify_emails");
  const kucalc = useTypedRedux("customize", "kucalc");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");

  function render_account_settings(): React.JSX.Element {
    return (
      <AccountSettings
        account_id={account_id}
        first_name={first_name}
        last_name={last_name}
        name={name}
        email_address={email_address}
        email_address_verified={email_address_verified}
        passports={passports}
        sign_out_error={sign_out_error}
        other_settings={other_settings as any}
        is_anonymous={is_anonymous}
        email_enabled={email_enabled}
        verify_emails={verify_emails}
        created={created}
        strategies={strategies}
        unlisted={unlisted}
      />
    );
  }

  function render_other_settings(): React.JSX.Element {
    if (other_settings == null) return <Loading />;
    return (
      <OtherSettings
        other_settings={other_settings as any}
        is_stripe_customer={
          !!stripe_customer?.getIn(["subscriptions", "total_count"])
        }
        kucalc={kucalc}
      />
    );
  }

  function renderDarkMode(): React.JSX.Element {
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

  function render_all_settings(): React.JSX.Element {
    return (
      <>
        <Flex>
          <div style={{ flex: 1 }} />
          {renderDarkMode()}
        </Flex>
        <Row>
          <Col xs={12} md={6}>
            {render_account_settings()}
            <ProfileSettings
              email_address={email_address}
              // first_name={first_name}
              // last_name={last_name}
            />
            {render_other_settings()}
            {(ssh_gateway || kucalc === KUCALC_COCALC_COM) && <GlobalSSHKeys />}
            {!is_anonymous && <ApiKeys />}
          </Col>
          <Col xs={12} md={6}>
            <EditorSettings />
            <TerminalSettings />
            <KeyboardSettings />
          </Col>
        </Row>
      </>
    );
  }

  return (
    <div>
      <TableError />
      {is_anonymous ? render_account_settings() : render_all_settings()}
    </div>
  );
};
