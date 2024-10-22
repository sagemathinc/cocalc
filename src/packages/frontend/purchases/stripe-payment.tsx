import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { LineItem, PaymentIntentSecret } from "@cocalc/util/stripe/types";
import { useEffect, useState } from "react";
import { createPaymentIntent } from "./api";
import { Button, Spin } from "antd";
import { loadStripe } from "@cocalc/frontend/billing/stripe";
import ShowError from "@cocalc/frontend/components/error";

export default function StripePayment({
  lineItems,
  purpose,
}: {
  lineItems?: LineItem[];
  purpose: string;
}) {
  const [secret, setSecret] = useState<PaymentIntentSecret | null>(null);
  const [error, setError] = useState<string>("");
  useEffect(() => {
    if (lineItems == null || lineItems.length == 0) {
      return;
    }
    const init = async () => {
      try {
        setError("");
        setSecret(
          await createPaymentIntent({
            line_items: lineItems,
            purpose,
          }),
        );
      } catch (err) {
        setError(`${err}`);
      }
    };
    init();
  }, [lineItems]);

  if (error) {
    return <ShowError error={error} setError={setError} />;
  }

  if (lineItems == null || lineItems.length == 0) {
    return null;
  }

  if (secret == null) {
    return <Spin />;
  }

  return (
    <Elements
      options={{
        ...secret,
        appearance: {
          theme: "stripe",
        },
        loader: "auto",
      }}
      stripe={loadStripe()}
    >
      <PaymentForm />
    </Elements>
  );
}

function PaymentForm({}) {
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      return;
    }

    setIsSubmitting(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Make sure to change this to your payment completion page
        return_url: "http://localhost:3000/complete",
      },
    });

    // This point will only be reached if there is an immediate error when
    // confirming the payment. Otherwise, your customer will be redirected to
    // your `return_url`. For some payment methods like iDEAL, your customer will
    // be redirected to an intermediate site first to authorize the payment, then
    // redirected to the `return_url`.
    if (error.type === "card_error" || error.type === "validation_error") {
      setMessage(error.message);
    } else {
      setMessage("An unexpected error occurred.");
    }

    setIsSubmitting(false);
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <h2>Add Money to Your Account</h2>
      <br />
      <PaymentElement
        id="payment-element"
        options={{
          layout: "tabs",
        }}
      />
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <Button
          size="large"
          style={{ marginTop: "15px" }}
          type="primary"
          disabled={isSubmitting || !stripe || !elements}
          id="submit"
        >
          <span id="button-text">{isSubmitting ? <Spin /> : "Pay Now"}</span>
        </Button>
      </div>
      {/* Show any error or success messages */}
      {message && <div id="payment-message">{message}</div>}
    </form>
  );
}
