/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Modal, Space } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { emailVerificationMsg } from "@cocalc/frontend/account/settings/email-verification";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  redux,
  useActions,
  useAsyncEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, Text } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { once } from "@cocalc/util/async-utils";

const DISMISSED_KEY_LS = "verify-email-dismissed";

export function VerifyEmail() {
  const [hide, setHide] = useState<boolean>(false);
  const show = useShowVerifyEmail();

  function doDismiss(save = true) {
    if (save) {
      const now = webapp_client.server_time().getTime();
      LS.set(DISMISSED_KEY_LS, now);
    }
    setHide(true);
  }

  if (show && !hide) {
    return <VerifyEmailModal doDismiss={doDismiss} />;
  } else {
    return null;
  }
}

function VerifyEmailModal({
  doDismiss,
}: {
  doDismiss: (save?: boolean) => void;
}) {
  const intl = useIntl();
  const page_actions = useActions("page");
  const email_address = useTypedRedux("account", "email_address");

  const [error, setError] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);

  async function verify(): Promise<void> {
    try {
      setSending(true);
      await webapp_client.account_client.send_verification_email();
    } catch (err) {
      const errMsg = `Problem sending email verification: ${err}`;
      setError(errMsg);
    } finally {
      setSent(true);
    }
  }

  // TODO: at one point this should be a popup to just edit the email address
  function edit() {
    doDismiss(false);
    page_actions.set_active_tab("account");
  }

  function renderBanner() {
    if (error) {
      return <Text type="danger">{error}</Text>;
    }
    return (
      <>
        <Paragraph strong>
          <FormattedMessage
            id="app.verify-email-banner.text"
            defaultMessage={`{sent, select,
            true {Email Sent! Please check your email inbox (and maybe spam) and click on the confirmation link.}
            other {Please check and verify your email address:}}`}
            values={{
              sent,
              code: (c) => <Text code>{c}</Text>,
            }}
          />
        </Paragraph>
        {!sent ? (
          <>
            <Paragraph code style={{ textAlign: "center" }}>
              {email_address}
            </Paragraph>
            <Paragraph type="secondary">
              <FormattedMessage
                id="app.verify-email-banner.help.text"
                defaultMessage="It's important to have a working email address. We use it for password resets, sending messages, billing notifications, and support. Please ensure your email is correct to stay informed."
              />
            </Paragraph>
            <Paragraph type="secondary">
              <FormattedMessage
                id="app.verify-email-banner.edit"
                defaultMessage="If the email address is wrong, please <E>edit</E> it in the account settings."
                values={{
                  E: (text) => (
                    <Button onClick={edit} bsSize="xsmall">
                      <Icon name="pencil" /> {text}
                    </Button>
                  ),
                }}
              />
            </Paragraph>
          </>
        ) : null}
      </>
    );
  }

  function renderFooter() {
    if (sent) {
      return (
        <Button onClick={() => doDismiss()} bsStyle="success">
          {intl.formatMessage(labels.close)}
        </Button>
      );
    }

    return (
      <Space>
        <Button onClick={() => doDismiss()}>
          {intl.formatMessage(labels.close)}
        </Button>
        <Button
          onClick={verify}
          bsStyle="success"
          active={!sent && sending}
          disabled={sent || sending}
        >
          {intl.formatMessage(emailVerificationMsg, {
            disabled_button: sent,
          })}
        </Button>
      </Space>
    );
  }

  function renderTitle() {
    return (
      <>
        <Icon name="mail" />{" "}
        {intl.formatMessage({
          id: "app.verify-email-banner.title",
          defaultMessage: "Verify Your Email Address",
        })}
      </>
    );
  }

  return (
    <Modal
      title={renderTitle()}
      open={true}
      onCancel={() => doDismiss()}
      footer={renderFooter()}
    >
      {renderBanner()}
    </Modal>
  );
}

export function useShowVerifyEmail(): boolean {
  const email_address = useTypedRedux("account", "email_address");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified",
  );
  const [loaded, setLoaded] = useState<boolean>(false);

  // wait until the account settings are loaded to show the banner
  useAsyncEffect(async () => {
    const store = redux.getStore("account");
    if (!store.get("is_ready")) {
      await once(store, "is_ready");
    }
    setLoaded(true);
  }, []);

  const emailSendingEnabled = useTypedRedux("customize", "email_enabled");

  const created = useTypedRedux("account", "created");

  const dismissedTS = LS.get<number>(DISMISSED_KEY_LS);

  const show_verify_email =
    !email_address || !email_address_verified?.get(email_address);

  // we also do not show this for newly created accounts
  const now = webapp_client.server_time().getTime();
  const oneDay = 1 * 24 * 60 * 60 * 1000;
  const notTooNew = created != null && now > created.getTime() + oneDay;

  // dismissed banner works for a week
  const dismissed =
    typeof dismissedTS === "number" && now < dismissedTS + 7 * oneDay;

  return (
    show_verify_email &&
    loaded &&
    notTooNew &&
    !dismissed &&
    emailSendingEnabled
  );
}
