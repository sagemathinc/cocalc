/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Show payment methods.

TODO: we are only showing the credit card payment sources at present.
There are other types of sources, e.g., "ACH credit transfer".

In the *near* future we will support more payment methods!
*/

import { Alert, Button, Divider, Popconfirm, Table } from "antd";
import { useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { cmp } from "@cocalc/util/misc";
import { Title } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import useAPI from "lib/hooks/api";
import useIsMounted from "lib/hooks/mounted";
import SiteName from "components/share/site-name";

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
            disabled
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
            disabled
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

export default function PaymentMethods() {
  const { result, error, call } = useAPI("billing/get-customer");

  const cols: any = useMemo(() => {
    return columns(call);
  }, [call]);

  const cards = useMemo(() => {
    if (result?.sources == null) return [];
    // set default so can use in table
    const { default_source } = result;
    const cards: (CardProps & { id: string; default_source: boolean })[] = [];
    for (const row of result.sources.data) {
      if (row.id == default_source) {
        row.default_source = true;
      }
      if (row.id.startsWith("card_")) {
        cards.push(row);
      }
    }
    // sort by data rather than what comes back, so changing
    // default stays stable (since moving is confusing).
    cards.sort((x, y) => cmp(x.id, y.id));

    return cards;
  }, [result?.sources]);

  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading center />;
  }

  if (cards.length == 0) {
    return <div>x</div>;
  }

  return (
    <div>
      <Title level={2}>Credit Cards ({cards.length})</Title>
      <SiteName /> used to use a credit card on file for automatic subscription
      payments. We now use a new more flexible and powerful automatic payments
      system that works with far more payment providers. To configure it,{" "}
      <A href="/settings/subscriptions" external>
        click on <Button size="small">Enable Automatic Payments...</Button> in
        subscription settings...
      </A>
      {cards.length > 0 && (
        <div>
          <Divider>Legacy Cards</Divider>
          <>
            These are the credit cards that you have currently setup.{" "}
            <b>Don't worry -- your default card will continue to be used</b> for
            now if you don't configure automatic payments as explained above.
          </>
          <Table
            columns={cols}
            dataSource={cards}
            rowKey={"id"}
            style={{ marginTop: "15px", overflowX: "auto" }}
            pagination={{ hideOnSinglePage: true, pageSize: 100 }}
          />
          {result.sources?.has_more && (
            <Alert
              type="warning"
              showIcon
              message="WARNING: Some of your cards may not be displayed above, since there are so many."
            />
          )}
        </div>
      )}
    </div>
  );
}

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

interface CardProps {
  brand;
  last4;
  exp_month;
  exp_year;
  country;
  address_zip;
}

export function CreditCard(props: CardProps) {
  const { brand, last4, exp_month, exp_year, country, address_zip } = props;
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
