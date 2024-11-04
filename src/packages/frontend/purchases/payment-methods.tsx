import { Button, Divider, Flex, Spin, Space, Table } from "antd";
import { useEffect, useState } from "react";
import { getPaymentMethods } from "./api";
import { BigSpin } from "./stripe-payment";
import { describeNumberOf } from "./util";
import ShowError from "@cocalc/frontend/components/error";
import { Icon, isIconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";

type PaymentMethod = any;

export default function PaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(
    null,
  );
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const init = async ({ limit }) => {
    await loadMore({ paymentMethods: null, limit });
  };

  const loadMore = async ({ paymentMethods, limit }) => {
    try {
      setError("");
      setLoading(true);
      const starting_after =
        paymentMethods != null
          ? paymentMethods[paymentMethods.length - 1]?.id
          : undefined;
      const x = await getPaymentMethods({
        starting_after,
        limit,
      });
      setPaymentMethods((paymentMethods ?? []).concat(x.data));
      setHasMore(x.has_more);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    init({ limit: 5 });
  }, []);

  if (loading) {
    return <BigSpin />;
  }

  return (
    <div>
      <Flex>
        <div style={{ flex: 1 }}>
          <Divider orientation="left">
            {describeNumberOf({
              n: paymentMethods?.length,
              hasMore,
              loadMore: () => {
                loadMore({ paymentMethods, limit: 10 });
              },
              loading,
              type: "Payment Method",
            })}
            {loading && <Spin style={{ marginLeft: "15px" }} />}
          </Divider>
        </div>
        <Button
          style={{ marginTop: "15px" }}
          type="link"
          onClick={() => {
            init({ limit: paymentMethods?.length ?? 5 });
          }}
        >
          <Icon name="refresh" /> Refresh
        </Button>
      </Flex>
      <ShowError error={error} setError={setError} />
      {paymentMethods != null && (
        <Table
          dataSource={paymentMethods}
          pagination={false}
          rowKey={"id"}
          columns={[
            {
              title: "Payment Method",
              dataIndex: "id",
              key: "id",
              render: (_, record) => <PaymentMethod paymentMethod={record} />,
            },
            {
              title: <div style={{ marginLeft: "15px" }}>Actions</div>,
              render: (_, record) => (
                <PaymentMethodControls paymentMethod={record} />
              ),
              width: 200,
            },
          ]}
          expandable={{
            expandRowByClick: true,
            expandedRowRender: (record: any) => {
              return <pre>{JSON.stringify(record, undefined, 2)}</pre>;
            },
          }}
        />
      )}
    </div>
  );
}

function PaymentMethodControls({ paymentMethod }) {
  return (
    <Space>
      <Button type="text">Set as Default</Button>
      <Button
        danger
        type="text"
        onClick={() => {
          console.log("delete", paymentMethod);
        }}
      >
        Delete
      </Button>
    </Space>
  );
}
function PaymentMethod({ paymentMethod }) {
  switch (paymentMethod.type) {
    case "card":
      return <Card paymentMethod={paymentMethod} />;
    default:
      return <div>{capitalize(paymentMethod.type)}</div>;
  }
}

function Card({ paymentMethod }) {
  const iconName = `cc-${paymentMethod.card.brand}`;
  const icon = isIconName(iconName) ? <Icon name={iconName} /> : undefined;
  return (
    <Flex>
      <b style={{ fontSize: "13pt" }}>
        {icon} {capitalize(paymentMethod.card.brand)} ••••{" "}
        {paymentMethod.card.last4}
      </b>
      <div style={{ flex: 1 }} />
      <div style={{ color: "#666", fontSize: "13pt" }}>
        Expires {paymentMethod.card.exp_month} / {paymentMethod.card.exp_year}
      </div>
    </Flex>
  );
}
