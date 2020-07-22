/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { ProfileSettings } from "./profile-settings";
import { TerminalSettings } from "./terminal-settings";
import { KeyboardSettings } from "./keyboard-settings";
import { AccountSettings } from "./settings/account-settings";
import { Row, Col } from "../antd-bootstrap";
import { Footer } from "../customize";
import { OtherSettings } from "./other-settings";
import { EditorSettings } from "./editor-settings/editor-settings";
import { Loading } from "../r_misc";

export const AccountPreferences: React.FC = () => {
  const account_id = useTypedRedux("account", "account_id");
  const first_name = useTypedRedux("account", "first_name");
  const last_name = useTypedRedux("account", "last_name");
  const email_address = useTypedRedux("account", "email_address");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified"
  );
  const passports = useTypedRedux("account", "passports");
  const sign_out_error = useTypedRedux("account", "sign_out_error");
  const autosave = useTypedRedux("account", "autosave");
  const font_size = useTypedRedux("account", "font_size");
  const editor_settings = useTypedRedux("account", "editor_settings");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const created = useTypedRedux("account", "created");
  const strategies = useTypedRedux("account", "strategies");
  const email_enabled = useTypedRedux("customize", "email_enabled");
  const verify_emails = useTypedRedux("customize", "verify_emails");

  function render_account_settings(): JSX.Element {
    return (
      <AccountSettings
        account_id={account_id}
        first_name={first_name}
        last_name={last_name}
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
      />
    );
  }

  function render_other_settings(): JSX.Element {
    if (other_settings == null) return <Loading />;
    return (
      <OtherSettings
        other_settings={other_settings as any}
        is_stripe_customer={
          !!stripe_customer?.getIn(["subscriptions", "total_count"])
        }
      />
    );
  }

  function render_all_settings(): JSX.Element {
    return (
      <div style={{ marginTop: "1em" }}>
        <Row>
          <Col xs={12} md={6}>
            {render_account_settings()}
            <ProfileSettings
              email_address={email_address}
              first_name={first_name}
              last_name={last_name}
            />
            {render_other_settings()}
          </Col>
          <Col xs={12} md={6}>
            <EditorSettings
              autosave={autosave}
              tab_size={editor_settings?.get("tab_size")}
              font_size={font_size}
              editor_settings={editor_settings as any}
              email_address={email_address}
            />
            <TerminalSettings />
            <KeyboardSettings />
          </Col>
        </Row>
        <Footer />
      </div>
    );
  }

  if (is_anonymous) {
    return render_account_settings();
  } else {
    return render_all_settings();
  }
};
