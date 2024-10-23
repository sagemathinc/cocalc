import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { PaymentIntentSecret } from "@cocalc/util/stripe/types";
import { useCallback, useEffect, useState } from "react";
import { createPaymentIntent, processPaymentIntents } from "./api";
import { Button, Spin } from "antd";
import { loadStripe } from "@cocalc/frontend/billing/stripe";
import ShowError from "@cocalc/frontend/components/error";
import { delay } from "awaiting";
import { currency } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { debounce } from "lodash";

const PAYMENT_UPDATE_DEBOUNCE = 2000;

export default function StripePayment({
  amount,
  description = "",
  purpose = "add-credit",
  onFinished,
  style,
  disabled,
}: {
  // it is highly recommend to set all fields, but not required!
  amount?: number;
  description?: string;
  purpose?: string;
  onFinished?: Function;
  style?;
  disabled?: boolean;
}) {
  const [secret, setSecret] = useState<PaymentIntentSecret | null>(null);
  const [error, setError] = useState<string>("");
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const updateSecret = useCallback(
    debounce(
      reuseInFlight(async ({ amount, description, purpose }) => {
        try {
          setError("");
          setLoading(true);
          setSecret(
            await createPaymentIntent({
              amount,
              description,
              purpose,
            }),
          );
          setPayAmount(amount);
        } catch (err) {
          setError(`${err}`);
        } finally {
          setLoading(false);
        }
      }),
      PAYMENT_UPDATE_DEBOUNCE,
      { leading: true, trailing: true },
    ),
    [],
  );

  useEffect(() => {
    if (!amount) {
      return;
    }
    updateSecret({ amount, description, purpose });
  }, [amount, description, purpose]);

  if (error) {
    return <ShowError style={style} error={error} setError={setError} />;
  }

  if (!amount) {
    return null;
  }

  if (secret == null) {
    return <BigSpin style={style} />;
  }

  return (
    <Elements
      options={{
        ...secret,
        appearance: {
          theme: "stripe",
        },
        loader: "never",
      }}
      stripe={loadStripe()}
    >
      <PaymentForm
        style={style}
        onFinished={onFinished}
        amount={payAmount}
        disabled={disabled || loading || payAmount != amount}
      />
    </Elements>
  );
}

function PaymentForm({ style, amount, onFinished, disabled }) {
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState<boolean>(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      return;
    }

    try {
      setIsSubmitting(true);

      const { error } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          // TODO: this URL needs to trigger processing payment intents...
          return_url: location.href,
        },
      });

      try {
        await processPaymentIntents();
      } catch (err) {
        console.warn("issue processing payment", err);
        // would usually be due to throttling, but could be network went down or
        // cocalc went down at exactly the wrong time.
        console.log("try again in 15s...");
        await delay(15000);
        try {
          await processPaymentIntents();
        } catch (err) {
          console.warn("still failing to processing payment", err);
          setMessage(
            `Your payment appears to have went through, but CoCalc has not yet received the funds.  Please close this dialog and check the payment status panel. ${err}`,
          );
          return;
          // still failing -- a backend maintenance task does
          // handle any missed payments within a few minutes.
          // And also there is the "payment status" panel.
        }
      }
      if (!error) {
        setSuccess(true);
        onFinished?.();
        return;
      }
      if (error.type === "card_error" || error.type === "validation_error") {
        setMessage(error.message);
      } else {
        setMessage("An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={style}>
      {!ready && <BigSpin />}
      <PaymentElement
        onReady={() => {
          setReady(true);
        }}
        id="payment-element"
        options={{
          layout: "tabs",
        }}
      />
      {ready && (
        <div style={{ textAlign: "center", marginTop: "15px" }}>
          <Button
            size="large"
            style={{ marginTop: "15px", fontSize: "14pt" }}
            type="primary"
            disabled={
              success ||
              disabled ||
              isSubmitting ||
              !stripe ||
              !elements ||
              !ready ||
              !!message
            }
            id="submit"
            onClick={handleSubmit}
          >
            {!success && (
              <>
                Confirm {currency(amount)} Payment{" "}
                {isSubmitting && <Spin style={{ marginLeft: "15px" }} />}
              </>
            )}
            {success && <>Purchase Successfully Completed!</>}
          </Button>
        </div>
      )}
      {/* Show error message */}
      <ShowError
        error={message}
        style={{ marginTop: "15px" }}
        setError={setMessage}
      />
    </div>
  );
}

function BigSpin({ style }: { style? }) {
  return (
    <div style={{ ...style, textAlign: "center" }}>
      <Spin tip="Loading" size="large">
        <div
          style={{
            padding: 50,
            background: "rgba(0, 0, 0, 0.05)",
            borderRadius: 4,
          }}
        />
      </Spin>
    </div>
  );
}
