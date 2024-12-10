/*
These are being deprecated but 500+ are setup, so we're going to support having them exist if there
is no other payment method on file, and allowing users to disable it if they have it already.
Users without one setup will never see this button.

After a while -- when the 500+ is MUCH smaller, we may manually remove this.
*/

import { Alert, Button, Popconfirm, Spin } from "antd";
import { delay } from "awaiting";
import { CSSProperties, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import {
  cancelAutomaticBilling,
  cancelCurrentCheckoutSession,
  getCurrentCheckoutSession,
  setupAutomaticBilling,
  syncSubscription,
} from "./api";

interface Props {
  style?: CSSProperties;
}

export default function StripeMeteredSubscription({ style }: Props) {
  const intl = useIntl();

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const stripe_usage_subscription = useTypedRedux(
    "account",
    "stripe_usage_subscription",
  );
  const stripe_checkout_session = useTypedRedux(
    "account",
    "stripe_checkout_session",
  )?.toJS();

  if (!stripe_usage_subscription) {
    // due to deprecation, nothing to do except in the case of REMOVING existing setup.
    return null;
  }

  const legacyCard = !!stripe_usage_subscription?.startsWith("card");

  const doDisable = async () => {
    try {
      setLoading(true);
      await cancelAutomaticBilling();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  const doSetup = async () => {
    try {
      setLoading(true);
      const session = await setupAutomaticBilling({
        success_url: window.location.href,
        cancel_url: window.location.href,
      });
      await paymentPopup(session.url);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
      await getCurrentCheckoutSession(); // this eventually updates state of stripe_checkout_session variable above.
    }
  };

  const paymentPopup = async (url: string) => {
    const popup = open_new_tab(url, true);
    if (popup == null) {
      // popup was blocked
      return;
    }
    while (true) {
      if (popup.closed) {
        // user explicitly closed it, so done.
        break;
      }
      try {
        if (popup.location.href == window.location.href) {
          break;
        }
      } catch (_) {
        // due to security, when on the stripe page, just looking at
        // popup.location.href should throw an exception.
      }
      await delay(500);
    }
    // attempt to close the popup, if possible
    try {
      popup.close();
    } catch (_) {}

    // Have the backend call stripe and sync recent paid invoices.
    // **This should only be relevant in case webhooks aren't configured or working.**
    (async () => {
      for (const d of [5, 30, 60]) {
        try {
          if (await syncSubscription()) {
            return;
          }
          await delay(d * 1000);
        } catch (err) {
          console.warn(err);
          return;
        }
      }
    })();
  };

  const cancelSession = async () => {
    try {
      setLoading(true);
      await cancelCurrentCheckoutSession();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  const warning = (
    <Alert
      showIcon
      style={{ margin: "15px 30px" }}
      type="warning"
      message={intl.formatMessage({
        id: "purchases.automatic-payments-warning.title",
        defaultMessage:
          "Automatic payments are NOT required to have a subscription",
      })}
      description={
        <FormattedMessage
          id="purchases.automatic-payments-warning.description"
          defaultMessage={
            "Automatic payments are much <b>more convenient</b>, will <b>save you time</b>, and <b>ensure subscriptions don't get canceled</b> by accident."
          }
        />
      }
    />
  );

  function render_automatic_payments() {
    if (stripe_usage_subscription) return;

    const enableAutomaticPayments = intl.formatMessage({
      id: "purchases.automatic-payments.enable-automatic-payments.label",
      defaultMessage: "Enable Automatic Payments",
    });

    return (
      <Popconfirm
        placement="right"
        onConfirm={doSetup}
        title={enableAutomaticPayments}
        okText={`${enableAutomaticPayments}...`}
        description={
          stripe_checkout_session?.url != null ? (
            <div>
              There is a current stripe checkout session in progress.
              <br />
              <Button onClick={cancelSession}>Cancel Session</Button>
              <div style={{ marginTop: "15px" }}>
                If the popup window is blocked,{" "}
                <a href={stripe_checkout_session?.url}>
                  click here to complete your payment...
                </a>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: "500px" }}>
              <FormattedMessage
                id="purchases.automatic-payments.enable-automatic-payments.message"
                defaultMessage={`Would you like to enable automatic payments?
                  You will automatically be charged for any subscriptions, etc., once per month.
                  {warning}
                  You can disable automatic payments at any time,
                  and you can resume a canceled subscription easily later.`}
                values={{ warning }}
              />
            </div>
          )
        }
      >
        <Button disabled={loading}>
          <Icon name="credit-card" /> {enableAutomaticPayments}{" "}
          {loading && <Spin />}
        </Button>
      </Popconfirm>
    );
  }

  return (
    <div style={style}>
      <ShowError error={error} setError={setError} />
      {!!stripe_usage_subscription && (
        <Popconfirm
          placement="right"
          onConfirm={legacyCard ? doSetup : doDisable}
          title={
            legacyCard
              ? "Update Your Automatic Payment Method"
              : "Disable Automatic Payments"
          }
          okText={legacyCard ? "Update" : "Disable Automatic Payments"}
          cancelText={"Close"}
          description={
            stripe_checkout_session?.url != null ? (
              <div>
                There is a current stripe checkout session in progress.
                <br />
                <Button onClick={cancelSession}>Cancel Session</Button>
                <div style={{ marginTop: "15px" }}>
                  If the popup window is blocked,{" "}
                  <a href={stripe_checkout_session?.url}>
                    click here to complete your payment...
                  </a>
                </div>
              </div>
            ) : legacyCard ? (
              <div style={{ maxWidth: "400px" }}>
                <FormattedMessage
                  id="purchases.automatic-payments.card-on-file.message"
                  defaultMessage={`You have a credit card on file. Please click "Update" below to
                    enter a new payment method and switch to the new automatic
                    payments systems. After that you can easily cancel or enable
                    automatic payments at any time.`}
                />
              </div>
            ) : (
              <div style={{ maxWidth: "400px" }}>
                <FormattedMessage
                  id="purchases.automatic-payments.have-automatic-payments.message"
                  defaultMessage={
                    "You have legacy automatic payments configured.  We recommend that you disable legacy automatic payments, and instead explicitly add a payment method below."
                  }
                  values={{ warning }}
                />
              </div>
            )
          }
        >
          <Button
            disabled={loading}
            style={
              legacyCard ? { background: "red", color: "white" } : undefined
            }
          >
            {legacyCard ? (
              <>
                <Icon name="credit-card" />{" "}
                <FormattedMessage
                  id="purchases.automatic-payments.update-required"
                  defaultMessage={"Automatic Payments: Update Required"}
                />
              </>
            ) : (
              <>
                <Icon name="check" /> <Icon name="credit-card" />{" "}
                <FormattedMessage
                  id="purchases.automatic-payments.are-enabled"
                  defaultMessage={"Automatic Payments are Enabled"}
                />
              </>
            )}
            {loading && <Spin />}
          </Button>
        </Popconfirm>
      )}
      {render_automatic_payments()}
    </div>
  );
}
