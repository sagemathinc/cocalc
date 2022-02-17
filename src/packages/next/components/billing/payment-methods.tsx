/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Show payment methods.

TODO: we are only showing the credit card payment sources at present.
There are other types of sources, e.g., "ACH credit transfer".

In the *near* future we will support more payment methods!
*/

import { CSSProperties, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import HelpEmail from "components/misc/help-email";
import A from "components/misc/A";
import { Alert, Button, Popconfirm, Table } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import { cmp } from "@cocalc/util/misc";
import useCustomize from "lib/use-customize";
import Script from "next/script";
import useIsMounted from "lib/hooks/mounted";
import SiteName from "components/share/site-name";
import salesTax from "@cocalc/util/stripe/sales-tax";

const STRIPE_CLIENT_LIBRARY = "https://js.stripe.com/v3/";

function Brand({ brand }) {
  return (
    <>
      {brand?.includes(" ") ? (
        ""
      ) : (
        <Icon name={`cc-${brand?.toLowerCase()}` as any} />
      )}{" "}
      {brand}
    </>
  );
}

function Number({ last4 }) {
  return <>{`**** **** **** ${last4}`}</>;
}

function ExpirationDate({ exp_month, exp_year }) {
  return <>{`${exp_month}/${exp_year}`}</>;
}

function PaymentSourceActions({ onChange, default_source, brand, last4, id }) {
  const isMounted = useIsMounted();
  const [error, setError] = useState<string>("");
  return (
    <div>
      {error && (
        <Alert type="error" message={error} style={{ marginBottom: "5px" }} />
      )}
      {default_source ? (
        <Popconfirm
          placement="topLeft"
          showCancel={false}
          title={
            <div style={{ width: "400px" }}>
              The default payment method is the{" "}
              <b>
                {brand} card ending in ...
                {last4}
              </b>
              . It will be used by default for subscriptions and new purchases.
            </div>
          }
          okText="OK"
        >
          <Button
            type={"primary"}
            style={{ marginRight: "5px", marginBottom: "5px" }}
          >
            Default
          </Button>
        </Popconfirm>
      ) : (
        <Popconfirm
          placement="topLeft"
          title={
            <div style={{ width: "400px" }}>
              Do you want to set the{" "}
              <b>
                {brand} card ending in ...{last4}
              </b>{" "}
              to be the default for subscriptions and new purchases?
            </div>
          }
          onConfirm={async () => {
            try {
              setError("");
              await apiPost("/billing/set-default-source", {
                default_source: id,
              });
              if (!isMounted.current) return;
              onChange?.();
            } catch (err) {
              if (!isMounted.current) return;
              setError(err.message);
            }
          }}
          okText="Yes"
          cancelText="No"
        >
          <Button
            type={"dashed"}
            style={{ marginRight: "5px", marginBottom: "5px" }}
          >
            Default
          </Button>
        </Popconfirm>
      )}
      <Popconfirm
        placement="topLeft"
        title={
          <div style={{ width: "400px" }}>
            Do you want to delete the{" "}
            <b>
              {brand} card ending in ...{last4}
            </b>
            ? It will no longer be used for subscriptions and you will have to
            enter it again to use it to make a purchase.
          </div>
        }
        onConfirm={async () => {
          try {
            setError("");
            await apiPost("/billing/delete-payment-method", { id });
            onChange?.();
          } catch (err) {
            setError(err.message);
          }
        }}
        okText="Yes, delete this card"
        cancelText="Cancel"
      >
        <Button type="dashed">
          <Icon name="trash" /> Delete
        </Button>
      </Popconfirm>
    </div>
  );
}

const columns = (onChange) => [
  {
    responsive: ["xs"],
    title: "Card",
    render: (_, card) => (
      <div>
        <CreditCard {...card} />
        <PaymentSourceActions {...card} onChange={onChange} />
      </div>
    ),
  },
  {
    responsive: ["sm"],
    title: "Type",
    dataIndex: "brand",
    render: (_, card) => <Brand {...card} />,
  },
  {
    responsive: ["sm"],
    title: "Number",
    dataIndex: "last4",
    render: (_, card) => <Number {...card} />,
  },
  {
    responsive: ["sm"],
    title: "Expiration Date",
    align: "center" as "center",
    render: (_, card) => <ExpirationDate {...card} />,
  },
  {
    responsive: ["sm"],
    title: "Country",
    dataIndex: "country",
    align: "center" as "center",
  },
  {
    responsive: ["sm"],
    title: "Postal Code",
    dataIndex: "address_zip",
    align: "center" as "center",
  },
  {
    responsive: ["sm"],
    title: "",
    render: (_, card) => <PaymentSourceActions {...card} onChange={onChange} />,
  },
];

interface Props {
  startMinimized?: boolean;
  setTaxRate?: (rate: number) => void; // use to find out the sales tax rate for default billing method
}

export default function PaymentMethods({ startMinimized, setTaxRate }: Props) {
  const [minimized, setMinimized] = useState<boolean>(!!startMinimized);
  const { result, error, call } = useAPI("billing/get-customer");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading center />;
  }
  // set default so can use in table
  const { default_source } = result;
  const cards: any[] = [];
  if (result.sources != null) {
    for (const row of result.sources.data) {
      if (row.id == default_source) {
        row.default_source = true;
        if (setTaxRate != null) {
          setTaxRate(salesTax(row.address_zip));
        }
      }
      if (row.id.startsWith("card_")) {
        cards.push(row);
      }
    }
  }
  // sort by data rather than what comes back, so changing
  // default stays stable (since moving is confusing).
  cards.sort((x, y) => cmp(x.id, y.id));

  if (minimized) {
    let defaultCard = undefined;
    for (const card of cards) {
      if (card.default_source) {
        defaultCard = card;
        break;
      }
    }
    if (defaultCard) {
      return (
        <div>
          <A onClick={() => setMinimized(false)}>Change</A>
          <CreditCard {...defaultCard} />
        </div>
      );
    }
  }

  return (
    <div>
      {startMinimized && cards.length > 0 && (
        <div style={{ float: "right", marginRight: "15px" }}>
          <A onClick={() => setMinimized(true)}>
            Close <Icon name="times" />
          </A>
        </div>
      )}
      {!startMinimized && (
        <>
          <h3>Credit Cards ({cards.length})</h3>
          {cards.length > 0 ? (
            <>These are the credit cards that you have currently setup.</>
          ) : (
            <>Please enter your credit card below.</>
          )}{" "}
        </>
      )}
      <AddPaymentMethod
        defaultAdding={cards.length == 0}
        onChange={call}
        style={{ marginTop: "15px", marginBottom: "5px" }}
      />
      {cards.length > 0 && (
        <Table
          columns={columns(call) as any}
          dataSource={cards}
          rowKey={"id"}
          style={{ marginTop: "15px", overflowX: "scroll" }}
          pagination={{ hideOnSinglePage: true, pageSize: 100 }}
        />
      )}
      {result.sources?.has_more && (
        <Alert
          type="warning"
          showIcon
          message="WARNING: Some of your cards may not be displayed above, since there are so many."
        />
      )}
    </div>
  );
}

interface AddPaymentMethodProps {
  onChange?: () => void;
  style?: CSSProperties;
  defaultAdding?: boolean; // starts initially in creating mode
}

function AddPaymentMethod({
  onChange,
  style,
  defaultAdding,
}: AddPaymentMethodProps) {
  const [error, setError] = useState<string>("");
  const [adding, setAdding] = useState<boolean>(!!defaultAdding);
  const [creating, setCreating] = useState<boolean>(false);
  const [stripe, setStripe] = useState<null | { stripe: any; card: any }>(null);
  const cardRef = useRef<any>();
  const { stripePublishableKey } = useCustomize();
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!adding || !cardRef.current) return;
    if (stripe != null) {
      stripe.card.mount(ReactDOM.findDOMNode(cardRef.current));
    } else {
      if (window.Stripe == null) return;
      const stripe = window.Stripe(stripePublishableKey);
      const card = stripe.elements().create("card");
      if (card == null) throw Error("bug -- card cannot be null");
      setStripe({ stripe, card });
      card.mount(ReactDOM.findDOMNode(cardRef.current));
    }
  }, [adding, stripe]);

  return (
    <div style={style}>
      <Button disabled={adding} onClick={() => setAdding(true)}>
        <Icon name="plus-circle" /> Add Credit Card
      </Button>
      {adding && (
        <div
          style={{
            border: "1px solid #ddd",
            padding: "15px",
            borderRadius: "5px",
            maxWidth: "600px",
            margin: "15px auto",
          }}
        >
          <Script
            src={STRIPE_CLIENT_LIBRARY}
            onLoad={() => {
              const stripe = window.Stripe(stripePublishableKey);
              const card = stripe.elements().create("card");
              if (card == null) throw Error("bug -- card cannot be null");
              setStripe({ stripe, card });
            }}
            onError={() => {
              setError(
                `Stripe script failed to load. Make sure your browser is not blocking ${STRIPE_CLIENT_LIBRARY}, then refresh this page.`
              );
            }}
          />
          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ margin: "15px 0" }}
            />
          )}
          <div style={{ textAlign: "center" }}>
            <div
              ref={cardRef}
              style={{
                border: "1px solid lightgray",
                borderRadius: "5px",
                margin: "5px auto 20px auto",
                maxWidth: "400px",
                padding: "15px 10px",
                boxShadow: "5px 5px 5px lightgray",
              }}
            >
              {/* a Stripe Element will be inserted here. */}
            </div>

            <Button
              style={{ marginRight: "5px" }}
              onClick={() => setAdding(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              disabled={creating}
              type="primary"
              onClick={async () => {
                setCreating(true);
                try {
                  let token;
                  try {
                    const result = await stripe?.stripe.createToken(
                      stripe.card
                    );
                    if (!isMounted.current) return;
                    if (result.error) {
                      throw Error(result.error.message);
                    }
                    ({ token } = result);
                  } catch (err) {
                    if (!isMounted.current) return;
                    setError(err.message);
                    return;
                  }
                  try {
                    await apiPost("/billing/create-payment-method", {
                      id: token.id,
                    });
                    if (!isMounted.current) return;
                    onChange?.();
                    setAdding(false);
                  } catch (err) {
                    setError(err.message);
                  }
                } finally {
                  if (!isMounted.current) return;
                  setCreating(false);
                }
              }}
            >
              {creating ? (
                <Loading center delay={0}>
                  Adding Card...
                </Loading>
              ) : (
                "Add Card"
              )}
            </Button>
          </div>
          <div style={{ color: "#666", marginTop: "15px" }}>
            <SiteName /> does not directly store any credit card numbers;
            instead they are stored securely by{" "}
            <A href="https://stripe.com/" external>
              Stripe
            </A>
            . PayPal or wire transfers for non-recurring purchases above $100
            are also possible. <HelpEmail />.
          </div>
        </div>
      )}
    </div>
  );
}

export function CreditCard({
  brand,
  last4,
  exp_month,
  exp_year,
  country,
  address_zip,
}) {
  return (
    <div
      style={{
        backgroundColor: "#f0f0ff",
        border: "1px solid lightgrey",
        margin: "15px 0",
        padding: "10px",
        borderRadius: "5px",
        maxWidth: "300px",
      }}
    >
      <Brand brand={brand} />
      <br />
      <Number last4={last4} />
      <br />
      <ExpirationDate exp_month={exp_month} exp_year={exp_year} />
      <br />
      {country} {address_zip}
      <br />
    </div>
  );
}
