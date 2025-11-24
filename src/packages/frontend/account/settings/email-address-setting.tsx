/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Input, Space } from "antd";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { alert_message } from "@cocalc/frontend/alerts";
import { ErrorDisplay, LabeledRow, Saving } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { log } from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";
import { MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";

interface Props {
  email_address?: string;
  disabled?: boolean;
  is_anonymous?: boolean;
  verify_emails?: boolean;
}

export const EmailAddressSetting = ({
  email_address: email_address0,
  disabled,
  is_anonymous,
  verify_emails,
}: Props) => {
  const intl = useIntl();
  const [state, setState] = useState<"view" | "edit" | "saving">("view");
  const [password, setPassword] = useState<string>("");
  const [email_address, set_email_address] = useState<string>(
    email_address0 ?? "",
  );
  const [error, setError] = useState<string>("");

  function start_editing() {
    setState("edit");
    set_email_address(email_address0 ?? "");
    setError("");
    setPassword("");
  }

  function cancel_editing() {
    setState("view");
    setPassword("");
  }

  async function save_editing(): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setState("edit");
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      );
      return;
    }
    setState("saving");
    try {
      await webapp_client.account_client.change_email(email_address, password);
    } catch (error) {
      setState("edit");
      setError(`Error -- ${error}`);
      return;
    }
    if (is_anonymous) {
      log("email_sign_up", { source: "anonymous_account" });
    }
    setState("view");
    setError("");
    setPassword("");
    // if email verification is enabled, send out a token
    // in any case, send a welcome email to an anonymous user, possibly
    // including an email verification link
    if (!(verify_emails || is_anonymous)) {
      return;
    }
    try {
      // anonymous users will get the "welcome" email
      await webapp_client.account_client.send_verification_email(!is_anonymous);
    } catch (error) {
      const err_msg = `Problem sending welcome email: ${error}`;
      console.log(err_msg);
      alert_message({ type: "error", message: err_msg });
    }
  }

  function is_submittable(): boolean {
    return !!(password !== "" && email_address !== email_address0);
  }

  function render_error() {
    if (error) {
      return (
        <ErrorDisplay
          error={error}
          onClose={() => setError("")}
          style={{ marginTop: "15px" }}
        />
      );
    }
  }

  function render_edit() {
    const password_label = intl.formatMessage(
      {
        id: "account.settings.email_address.password_label",
        defaultMessage:
          "{have_email, select, true {Current password} other {Choose a password}}",
      },
      {
        have_email: !!email_address,
      },
    );
    return (
      <Card style={{ marginTop: "3ex" }}>
        <div style={{ marginBottom: "15px" }}>
          <FormattedMessage
            id="account.settings.email_address.new_email_address_label"
            defaultMessage="New email address"
          />
          <Input
            autoFocus
            placeholder="user@example.com"
            onChange={(e) => {
              set_email_address(e.target.value);
            }}
            maxLength={254}
          />
        </div>
        {password_label}
        <Input.Password
          value={password}
          placeholder={password_label}
          onChange={(e) => {
            const pw = e.target.value;
            if (pw != null) {
              setPassword(pw);
            }
          }}
          onPressEnter={() => {
            if (is_submittable()) {
              return save_editing();
            }
          }}
        />
        <Space style={{ marginTop: "15px" }}>
          <Button onClick={cancel_editing}>Cancel</Button>
          <Button
            disabled={!is_submittable()}
            onClick={save_editing}
            type="primary"
          >
            {button_label()}
          </Button>
        </Space>
        {render_error()}
        {render_saving()}
      </Card>
    );
  }

  function render_saving() {
    if (state === "saving") {
      return <Saving />;
    }
  }

  function button_label(): string {
    return intl.formatMessage(
      {
        id: "account.settings.email_address.button_label",
        defaultMessage: `{type, select,
      anonymous {Sign up using an email address and password}
      have_email {Change email address}
      other {Set email address and password}}`,
      },
      {
        type: is_anonymous ? "anonymous" : email_address ? "have_email" : "",
      },
    );
  }

  const label = is_anonymous ? (
    <h5 style={{ color: COLORS.GRAY_M }}>
      Sign up using an email address and password
    </h5>
  ) : (
    intl.formatMessage(labels.email_address)
  );

  return (
    <LabeledRow
      label={label}
      style={disabled ? { color: COLORS.GRAY_M } : undefined}
    >
      <div>
        {email_address}
        {state === "view" ? (
          <Button
            disabled={disabled}
            className="pull-right"
            onClick={start_editing}
          >
            {button_label()}...
          </Button>
        ) : undefined}
      </div>
      {state !== "view" ? render_edit() : undefined}
    </LabeledRow>
  );
};
