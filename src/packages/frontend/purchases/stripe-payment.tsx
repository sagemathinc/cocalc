import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { PaymentIntentSecret } from "@cocalc/util/stripe/types";
import { useEffect, useState } from "react";
import { createPaymentIntent, processPaymentIntents } from "./api";
import { Button, Spin } from "antd";
import { loadStripe } from "@cocalc/frontend/billing/stripe";
import ShowError from "@cocalc/frontend/components/error";
import { delay } from "awaiting";

export default function StripePayment({
  amount,
  description,
  purpose,
  onFinished,
}: {
  amount?: number;
  description: string;
  purpose: string;
  onFinished: Function;
}) {
  const [secret, setSecret] = useState<PaymentIntentSecret | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!amount) {
      return;
    }
    const init = async () => {
      try {
        setError("");
        setSecret(
          await createPaymentIntent({
            amount,
            description,
            purpose,
          }),
        );
      } catch (err) {
        setError(`${err}`);
      }
    };
    init();
  }, [amount, description]);

  if (error) {
    return <ShowError error={error} setError={setError} />;
  }

  if (!amount) {
    return null;
  }

  if (secret == null) {
    return <BigSpin />;
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
      <PaymentForm onFinished={onFinished} />
    </Elements>
  );
}

function PaymentForm({ onFinished }) {
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      } catch (_err) {
        await delay(15000);
        try {
          await processPaymentIntents();
        } catch (_err) {
          // still failing -- user can view the "payment status" panel,
          // and that will deal with anything that was missed.
        }
      }
      if (!error) {
        onFinished();
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
    <div>
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
            disabled={isSubmitting || !stripe || !elements || !ready}
            id="submit"
            onClick={handleSubmit}
          >
            <span id="button-text">
              {" "}
              Pay Now {isSubmitting && <Spin style={{ marginLeft: "15px" }} />}
            </span>
          </Button>
        </div>
      )}
      {/* Show any error or success messages */}
      {message && <div id="payment-message">{message}</div>}
    </div>
  );
}

function BigSpin() {
  return (
    <div style={{ textAlign: "center" }}>
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
