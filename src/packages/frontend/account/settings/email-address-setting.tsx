/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage, useIntl } from "react-intl";

import { alert_message } from "@cocalc/frontend/alerts";
import {
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Well,
} from "@cocalc/frontend/antd-bootstrap";
import {
  ReactDOM,
  Rendered,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, LabeledRow, Saving } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { log } from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  account_id: string;
  email_address?: string;
  disabled?: boolean;
  is_anonymous?: boolean;
  verify_emails?: boolean;
}

export const EmailAddressSetting = (props: Readonly<Props>) => {
  const intl = useIntl();

  const emailRef = useRef<FormControl>(null);
  const passwordRef = useRef<FormControl>(null);

  const [state, setState] = useState<"view" | "edit" | "saving">("view");
  const [password, setPassword] = useState<string>("");
  const [email_address, set_email_address] = useState<string>("");
  const [error, setError] = useState<string>("");

  function start_editing(): void {
    setState("edit");
    set_email_address(props.email_address != null ? props.email_address : "");
    setError("");
    setPassword("");
  }

  function cancel_editing(): void {
    setState("view");
    setPassword("");
  }

  async function save_editing(): Promise<void> {
    if (password.length < 6) {
      setState("edit");
      setError("Password must be at least 6 characters long.");
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
    if (props.is_anonymous) {
      log("email_sign_up", { source: "anonymous_account" });
    }
    setState("view");
    setError("");
    setPassword("");
    // if email verification is enabled, send out a token
    // in any case, send a welcome email to an anonymous user, possibly
    // including an email verification link
    if (!(props.verify_emails || props.is_anonymous)) {
      return;
    }
    try {
      // anonymouse users will get the "welcome" email
      await webapp_client.account_client.send_verification_email(
        !props.is_anonymous,
      );
    } catch (error) {
      const err_msg = `Problem sending welcome email: ${error}`;
      console.log(err_msg);
      alert_message({ type: "error", message: err_msg });
    }
  }

  function is_submittable(): boolean {
    return !!(password !== "" && email_address !== props.email_address);
  }

  function render_change_button(): Rendered {
    return (
      <Button
        disabled={!is_submittable()}
        onClick={save_editing}
        bsStyle="success"
      >
        {button_label()}
      </Button>
    );
  }

  function render_error(): Rendered {
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

  function render_edit(): Rendered {
    const password_label = intl.formatMessage(
      {
        id: "account.settings.email_address.password_label",
        defaultMessage:
          "{have_email, select, true {Current password} other {Choose a password}}",
      },
      {
        have_email: !!props.email_address,
      },
    );
    return (
      <Well style={{ marginTop: "3ex" }}>
        <FormGroup>
          <FormattedMessage
            id="account.settings.email_address.new_email_address_label"
            defaultMessage="New email address"
          />
          <FormControl
            autoFocus
            type="email_address"
            ref={emailRef}
            value={email_address}
            placeholder="user@example.com"
            onChange={() => {
              const em = ReactDOM.findDOMNode(emailRef.current)?.value;
              set_email_address(em);
            }}
            maxLength={254}
          />
        </FormGroup>
        {password_label}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (is_submittable()) {
              return save_editing();
            }
          }}
        >
          <FormGroup>
            <FormControl
              type="password"
              ref={passwordRef}
              value={password}
              placeholder={password_label}
              onChange={() => {
                const pw = ReactDOM.findDOMNode(passwordRef.current)?.value;
                if (pw != null) {
                  setPassword(pw);
                }
              }}
            />
          </FormGroup>
        </form>
        <ButtonToolbar>
          {render_change_button()}
          <Button onClick={cancel_editing}>Cancel</Button>
        </ButtonToolbar>
        {render_error()}
        {render_saving()}
      </Well>
    );
  }

  function render_saving(): Rendered {
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
        type: props.is_anonymous
          ? "anonymous"
          : props.email_address
          ? "have_email"
          : "",
      },
    );
  }

  const label = props.is_anonymous ? (
    <h5 style={{ color: COLORS.GRAY_M }}>
      Sign up using an email address and password
    </h5>
  ) : (
    intl.formatMessage(labels.email_address)
  );

  return (
    <LabeledRow
      label={label}
      style={props.disabled ? { color: COLORS.GRAY_M } : undefined}
    >
      <div>
        {props.email_address}
        {state === "view" ? (
          <Button
            disabled={props.disabled}
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
