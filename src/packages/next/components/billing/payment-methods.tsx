import { useState } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import A from "components/misc/A";
import { Alert, Button, Popconfirm, Table } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import { cmp } from "@cocalc/util/misc";

const columns = (onChange) => [
  {
    title: "Type",
    dataIndex: "brand",
    render: (brand) => (
      <>
        <Icon name={`cc-${brand.toLowerCase()}` as any} /> {brand}
      </>
    ),
  },
  {
    title: "Number",
    dataIndex: "last4",
    render: (last4) => `...${last4}`,
  },
  {
    title: "Expiration Date",
    align: "center" as "center",
    render: (_, { exp_month, exp_year }) => `${exp_month}/${exp_year}`,
  },
  {
    title: "Country",
    dataIndex: "country",
    align: "center" as "center",
  },
  {
    title: "Postal Code",
    dataIndex: "address_zip",
    align: "center" as "center",
  },
  {
    title: "Default",
    render: (_, { default_source, brand, last4, id }) => {
      const [error, setError] = useState<string>("");
      return (
        <>
          {error && (
            <Alert
              type="error"
              message={error}
              style={{ marginBottom: "5px" }}
            />
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
                  . It will be used by default for subscriptions and new
                  purchases.
                </div>
              }
              okText="OK"
            >
              <Button type={"primary"}>Default</Button>
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
                  onChange?.();
                } catch (err) {
                  setError(err.message);
                }
              }}
              okText="Yes"
              cancelText="No"
            >
              <Button type={"dashed"}>Default</Button>
            </Popconfirm>
          )}
        </>
      );
    },
  },
];

export default function PaymentMethods() {
  const { result, error, call } = useAPI("billing/get-customer");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }

  // set default so can use in table
  const { default_source } = result;
  for (const row of result.sources.data) {
    if (row.id == default_source) {
      row.default_source = true;
      break;
    }
  }
  // sort by data rather than what comes back, so changing
  // default stays stable (since moving is confusing).
  result.sources.data.sort((x, y) => cmp(x.id, y.id));

  return (
    <div>
      <h3>Payment Methods</h3>
      These are the credit cards and other payment methods that you have
      currently setup. Note that CoCalc does not directly store the actual
      credit card numbers (they are instead stored securely by{" "}
      <A href="https://stripe.com/" external>
        Stripe
      </A>
      ).
      <Table
        columns={columns(call) as any}
        dataSource={result.sources.data}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
      {result.sources.has_more && (
        <Alert
          type="warning"
          showIcon
          message="WARNING: Some of your cards are not displayed above, since there are so many."
        />
      )}
    </div>
  );
}
