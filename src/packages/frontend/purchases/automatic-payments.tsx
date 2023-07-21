import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { CSSProperties, useState } from "react";
import { Alert, Button, Popconfirm, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  cancelCurrentCheckoutSession,
  cancelAutomaticBilling,
  getCurrentCheckoutSession,
  setupAutomaticBilling,
} from "./api";
import ShowError from "@cocalc/frontend/components/error";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import { delay } from "awaiting";

interface Props {
  style?: CSSProperties;
}

export default function AutomaticPayments({ style }: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const stripe_usage_subscription = useTypedRedux(
    "account",
    "stripe_usage_subscription"
  );
  const stripe_checkout_session = useTypedRedux(
    "account",
    "stripe_checkout_session"
  )?.toJS();

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
      message="Automatic payments are NOT required to have a subscription"
      description=<>
        Automatic payments are much <b>more convenient</b>, will{" "}
        <b>save you time</b>, and{" "}
        <b>ensure subscriptions don't get cancelled</b> by accident.
      </>
    />
  );
  return (
    <div style={style}>
      <ShowError error={error} setError={setError} />
      {!!stripe_usage_subscription && (
        <Popconfirm
          onConfirm={doDisable}
          title="Disable Automatic Payments"
          okText={"Disable Automatic Payments"}
          cancelText={"Close"}
          description={
            <div style={{ maxWidth: "500px" }}>
              You have automatic payments enabled. Would you like to disable
              them? {warning}
              You can reenable automatic payments at any time, and you can
              resume a canceled subscription easily later.
            </div>
          }
        >
          {" "}
          <Button disabled={!!stripe_checkout_session?.url}>
            <Icon name="check" /> Automatic Payments are Enabled...
          </Button>
        </Popconfirm>
      )}
      {!stripe_usage_subscription && (
        <Popconfirm
          onConfirm={doSetup}
          title="Enable Automatic Payments"
          okText={"Enable Automatic Payments..."}
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
                {JSON.stringify(stripe_checkout_session)}
                Would you like to enable automatic payments? You will
                automatically be charged for any subscriptions, etc., once per
                month.
                {warning}
                You can disable automatic payments at any time, and you can
                resume a canceled subscription easily later.
              </div>
            )
          }
        >
          <Button>
            <Icon name="credit-card" /> Enable Automatic Payments...
          </Button>
        </Popconfirm>
      )}
      {loading && <Spin />}
    </div>
  );
}
