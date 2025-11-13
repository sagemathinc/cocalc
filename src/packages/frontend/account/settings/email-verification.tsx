/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";

import { alert_message } from "@cocalc/frontend/alerts";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  Rendered,
  useEffect,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { LabeledRow } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  email_address?: string;
  email_address_verified?: Map<string, boolean>;
}

export const emailVerificationMsg = defineMessage({
  id: "account.settings.email-verification.button.status",
  defaultMessage: `{disabled_button, select, true {Email Sent} other {Send Verification Email}}`,
});

export function EmailVerification({
  email_address,
  email_address_verified,
}: Props) {
  const intl = useIntl();

  const is_mounted = useIsMountedRef();
  const [disabled_button, set_disabled_button] = useState(false);

  useEffect(() => {
    set_disabled_button(false);
  }, [email_address]);

  async function verify(): Promise<void> {
    try {
      await webapp_client.account_client.send_verification_email();
    } catch (err) {
      const err_msg = `Problem sending email verification: ${err}`;
      console.log(err_msg);
      alert_message({ type: "error", message: err_msg });
    } finally {
      if (is_mounted.current) {
        set_disabled_button(true);
      }
    }
  }

  function render_status(): Rendered {
    if (email_address == null) {
      return (
        <span>
          <FormattedMessage
            id="account.settings.email-verification.unknown"
            defaultMessage={"Unknown"}
          />
        </span>
      );
    } else {
      if (email_address_verified?.get(email_address)) {
        return (
          <span style={{ color: "green" }}>
            <FormattedMessage
              id="account.settings.email-verification.verified"
              defaultMessage={"Verified"}
            />
          </span>
        );
      } else {
        return (
          <>
            <span key={1} style={{ color: "red", paddingRight: "3em" }}>
              <FormattedMessage
                id="account.settings.email-verification.button.label"
                defaultMessage={"Not Verified"}
              />
            </span>
            <Button
              onClick={verify}
              bsStyle="success"
              disabled={disabled_button}
            >
              {intl.formatMessage(emailVerificationMsg, { disabled_button })}
            </Button>
          </>
        );
      }
    }
  }

  return (
    <LabeledRow
      label={intl.formatMessage({
        id: "account.settings.email-verification.label",
        defaultMessage: "Email verification",
      })}
      style={{ marginBottom: "15px" }}
    >
      <div>
        <FormattedMessage
          id="account.settings.email-verification.status"
          defaultMessage={"Status: {status}"}
          values={{ status: render_status() }}
        />
      </div>
    </LabeledRow>
  );
}
