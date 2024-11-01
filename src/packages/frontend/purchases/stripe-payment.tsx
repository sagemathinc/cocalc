/*
- Define what you want to buy and how.
- See an itemized invoice.
- Commit to making that purchase (or delete it)
- Invoice is then finalized and payments attempted if you have a default payment method.
- If you do not have a payment method, get shown a StripeElements UI to enter or select one
- Once payment succeeds, process the invoice, which means getting the thing and also adding/removing credit from user's account.
- In case of pay-as-you-go and subscriptions, if payment doesn't succeed long enough, take action.
*/

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { LineItem, PaymentIntentSecret } from "@cocalc/util/stripe/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  //createPaymentIntent,
  getCheckoutSession,
  processPaymentIntents,
} from "./api";
import { Button, Card, Spin, Table } from "antd";
import { loadStripe } from "@cocalc/frontend/billing/stripe";
import ShowError from "@cocalc/frontend/components/error";
import { delay } from "awaiting";
import { currency } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { debounce } from "lodash";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { creditLineItem } from "@cocalc/util/upgrades/describe";

const PAYMENT_UPDATE_DEBOUNCE = 2000;

export default function StripePayment({
  amount,
  description = "",
  lineItems = [],
  purpose = "add-credit",
  onFinished,
  style,
  disabled,
}: {
  // it is highly recommend to set all fields, but not required!
  amount?: number;
  description?: string;
  lineItems?: LineItem[];
  purpose?: string;
  onFinished?: Function;
  style?;
  disabled?: boolean;
}) {
  const [checkout, setCheckout] = useState<boolean>(false);
  if (amount == null) {
    // no payment needed.
    return null;
  }
  const { credit, total } = creditLineItem({ lineItems, amount });
  const amountDue = total + (credit?.amount ?? 0);
  const excludesTax = amountDue == 0 ? false : true;

  useEffect(() => {
    setCheckout(false);
  }, [JSON.stringify(lineItems), amount]);

  return (
    <Card style={{ textAlign: "left" }}>
      <div style={{ margin: "0 0 5px 15px" }}>
        <b>{description}</b>
      </div>
      <LineItemsTable
        lineItems={credit ? lineItems.concat([credit]) : lineItems}
      />
      <div>
        <div>
          <TotalLine
            description={`Amount due${excludesTax ? " (excluding tax)" : ""}`}
            amount={amountDue}
          />
        </div>
        {!checkout && <ConfirmButton onClick={() => setCheckout(true)} />}
      </div>
      {checkout && !disabled && (
        <div>
          <StripeCheckout
            {...{
              lineItems: credit ? lineItems.concat([credit]) : lineItems,
              description,
              purpose,
              onFinished,
              style,
            }}
          />
        </div>
      )}
    </Card>
  );
}

function StripeCheckout({
  lineItems,
  description,
  purpose,
  onFinished,
  style,
}) {
  const [secret, setSecret] = useState<PaymentIntentSecret | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const updateSecret = useCallback(
    debounce(
      reuseInFlight(async ({ lineItems, description, purpose }) => {
        try {
          setError("");
          setLoading(true);
          let secret;
          let attempts = 3;
          for (let i = 0; i < attempts; i++) {
            try {
              secret = await getCheckoutSession({
                lineItems,
                description,
                purpose: purpose + "x",
              });
              break;
            } catch (err) {
              if (i >= attempts - 1) {
                throw err;
              } else {
                await delay(PAYMENT_UPDATE_DEBOUNCE);
              }
            }
          }
          setSecret(secret);
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
    updateSecret({ lineItems, description, purpose });
  }, [lineItems, description, purpose]);

  if (error) {
    return <ShowError style={style} error={error} setError={setError} />;
  }

  if (secret == null) {
    return <BigSpin style={style} />;
  }

  return (
    <div>
      {loading && <BigSpin />}
      <EmbeddedCheckoutProvider
        options={{
          fetchClientSecret: async () => secret.clientSecret,
          onComplete: () => {
            onFinished?.();
          },
        }}
        stripe={loadStripe()}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

/*
function StripeElements({
  amount,
  description,
  purpose,
  onFinished,
  style,
  disabled,
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
          let secret;
          let attempts = 3;
          for (let i = 0; i < attempts; i++) {
            try {
              secret = await createPaymentIntent({
                amount,
                description,
                purpose,
              });
              break;
            } catch (err) {
              if (i >= attempts - 1) {
                throw err;
              } else {
                await delay(PAYMENT_UPDATE_DEBOUNCE);
              }
            }
          }
          setSecret(secret);
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
    if (!amount || disabled) {
      return;
    }
    updateSecret({ amount, description, purpose });
  }, [amount, description, purpose, disabled]);

  if (error) {
    return <ShowError style={style} error={error} setError={setError} />;
  }

  if (!amount) {
    return null;
  }

  if (secret == null) {
    if (disabled) {
      return null;
    }
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
        disabled={disabled || loading || payAmount != amount}
      />
    </Elements>
  );
}
*/

export function FinishStripePayment({
  paymentIntent,
  style,
  onFinished,
}: {
  paymentIntent;
  style?;
  onFinished?;
}) {
  const [error, setError] = useState<string>("");

  if (error) {
    return <ShowError style={style} error={error} setError={setError} />;
  }

  return (
    <Elements
      options={{
        clientSecret: paymentIntent.client_secret,
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
        disabled={
          paymentIntent.status == "succeeded" ||
          paymentIntent.status == "canceled"
        }
      />
    </Elements>
  );
}

function PaymentForm({ style, onFinished, disabled }) {
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
          // because we use strict auth cookies, this can't be a page that requires
          // sign in.
          return_url: `${window.location.origin}${appBasePath}`,
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
        <ConfirmButton
          disabled={
            success ||
            disabled ||
            isSubmitting ||
            !stripe ||
            !elements ||
            !ready ||
            !!message
          }
          onClick={handleSubmit}
          success={success}
          isSubmitting={isSubmitting}
        />
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

function ConfirmButton({
  disabled,
  onClick,
  success,
  isSubmitting,
}: {
  disabled?: boolean;
  onClick;
  success?: boolean;
  isSubmitting?: boolean;
}) {
  return (
    <div style={{ textAlign: "center", marginTop: "15px" }}>
      <Button
        size="large"
        style={{ marginTop: "15px", fontSize: "14pt", padding: "25px" }}
        type="primary"
        disabled={disabled}
        onClick={onClick}
      >
        {!success && (
          <>
            Confirm Purchase
            {isSubmitting && <Spin style={{ marginLeft: "15px" }} />}
          </>
        )}
        {success && <>Purchase Successfully Completed!</>}
      </Button>
    </div>
  );
}

export function BigSpin({ style }: { style? }) {
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

const LINE_ITEMS_COLUMNS = [
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
  } as const,
  {
    title: "Amount",
    dataIndex: "amount",
    key: "amount",
    render: (amount) => currency(amount),
    align: "right",
  } as const,
];

function LineItemsTable({ lineItems }) {
  const dataSource = useMemo(() => {
    let key = 1;
    return lineItems.map((x) => {
      key += 1;
      return { key, ...x };
    });
  }, [lineItems]);

  return (
    <Table
      rowKey={"description"}
      pagination={false}
      dataSource={dataSource}
      columns={LINE_ITEMS_COLUMNS}
    />
  );
}

function TotalLine({ description, amount }) {
  return (
    <div style={{ display: "flex", margin: "20px 15px 0 0" }}>
      <div style={{ flex: 0.5 }} />
      <div style={{ fontWeight: 500, flex: 0.3 }}>{description}</div>
      <div style={{ flex: 0.2 }}>
        <div style={{ float: "right" }}>{currency(amount)}</div>
      </div>
    </div>
  );
}
