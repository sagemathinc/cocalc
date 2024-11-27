/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage, useIntl } from "react-intl";

import { emailVerificationMsg } from "@cocalc/frontend/account/settings/email-verification";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  redux,
  useAsyncEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { CloseX2, Icon, Text } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { once } from "@cocalc/util/async-utils";
import { COLORS } from "@cocalc/util/theme";

const VERIFY_EMAIL_STYLE: CSS = {
  width: "100%",
  padding: "5px",
  borderBottom: `1px solid ${COLORS.GRAY_D}`,
  background: COLORS.BS_GREEN_LL,
} as const;

export function VerifyEmail() {
  const intl = useIntl();
  const email_address = useTypedRedux("account", "email_address");
  const created = useTypedRedux("account", "created");

  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [show, setShow] = useState<boolean>(true);
  const [disabled, setDisabled] = useState<boolean>(false);

  // wait until the account settings are loaded to show the banner
  useAsyncEffect(async () => {
    const store = redux.getStore("account");
    if (!store.get("is_ready")) {
      await once(store, "is_ready");
    }
    setLoaded(true);
  }, []);

  async function verify(): Promise<void> {
    try {
      await webapp_client.account_client.send_verification_email();
    } catch (err) {
      const errMsg = `Problem sending email verification: ${err}`;
      setError(errMsg);
    } finally {
      setDisabled(true);
    }
  }

  function renderContent() {
    if (error) {
      return <Text type="danger">{error}</Text>;
    }
    return (
      <Text strong>
        <Icon name="mail" />{" "}
        <FormattedMessage
          id="app.verify-email-banner.text"
          defaultMessage={`Please check and verify your email address: <code>{email}</code>`}
          values={{ email: email_address, code: (c) => <Text code>{c}</Text> }}
        />{" "}
        <Button
          onClick={verify}
          bsStyle="success"
          disabled={disabled}
          bsSize={"small"}
        >
          {intl.formatMessage(emailVerificationMsg, {
            disabled_button: disabled,
          })}
        </Button>
      </Text>
    );
  }

  if (!created || !loaded || !show) return;

  // we also do not show this for newly created accounts
  const now = webapp_client.server_time().getTime();
  const day1 = 1 * 24 * 60 * 60 * 1000;
  if (now - day1 < created.getTime()) return;

  return (
    <div style={VERIFY_EMAIL_STYLE}>
      {renderContent()}
      <CloseX2 close={() => setShow(false)} />
    </div>
  );
}

export function useShowVerifyEmail() {
  const email_address = useTypedRedux("account", "email_address");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified",
  );
  const show_verify_email =
    !email_address || !email_address_verified?.get(email_address);

  return show_verify_email;
}
