import {
  Button,
  Divider,
  Flex,
  Popconfirm,
  Spin,
  Space,
  Table,
  Tag,
} from "antd";
import { useEffect, useState } from "react";
import {
  getPaymentMethods,
  setDefaultPaymentMethod as setDefaultPaymentMethodUsingApi,
  deletePaymentMethod,
} from "./api";
import { BigSpin } from "./stripe-payment";
import { describeNumberOf } from "./util";
import ShowError from "@cocalc/frontend/components/error";
import { Icon, isIconName } from "@cocalc/frontend/components/icon";
import { capitalize, path_to_title } from "@cocalc/util/misc";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

type PaymentMethod = any;

export default function PaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(
    null,
  );
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<
    string | null
  >(null);
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
      if (x.default_payment_method) {
        setDefaultPaymentMethod(x.default_payment_method);
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    init({ limit: 5 });
  }, []);

  if (loading && paymentMethods == null) {
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
              width: 100,
              render: (_, { id }) => {
                if (defaultPaymentMethod == id) {
                  return <Tag color="blue">Default</Tag>;
                } else {
                  return null;
                }
              },
            },
            {
              title: <div style={{ marginLeft: "15px" }}>Actions</div>,
              render: (_, record) => (
                <PaymentMethodControls
                  paymentMethod={record}
                  isDefault={defaultPaymentMethod == record.id}
                  setError={setError}
                  loading={loading}
                  setLoading={setLoading}
                  setDefaultPaymentMethod={setDefaultPaymentMethod}
                  paymentMethods={paymentMethods}
                  setPaymentMethods={setPaymentMethods}
                />
              ),
              width: 200,
            },
          ]}
          expandable={{
            expandedRowRender: (record: any) => {
              return (
                <StaticMarkdown
                  value={
                    "```json\n" + JSON.stringify(record, undefined, 2) + "\n```"
                  }
                />
              );
            },
          }}
        />
      )}
    </div>
  );
}

function PaymentMethodControls({
  paymentMethod,
  isDefault,
  loading,
  setLoading,
  setError,
  setDefaultPaymentMethod,
  paymentMethods,
  setPaymentMethods,
}) {
  return (
    <Space>
      <Button
        disabled={isDefault || loading}
        type="text"
        onClick={async () => {
          try {
            setError("");
            setLoading(true);
            await setDefaultPaymentMethodUsingApi({
              default_payment_method: paymentMethod.id,
            });
            setDefaultPaymentMethod(paymentMethod.id);
          } catch (err) {
            setError(`${err}`);
          } finally {
            setLoading(false);
          }
        }}
      >
        Set as Default
      </Button>
      <Popconfirm
        title="Are you sure?"
        description="Deleting this PaymentMethod means it can no longer be used for payments."
        onConfirm={async () => {
          try {
            setError("");
            setLoading(true);
            await deletePaymentMethod({
              payment_method: paymentMethod.id,
            });
            setPaymentMethods(
              paymentMethods.filter((x) => x.id != paymentMethod.id),
            );
          } catch (err) {
            setError(`${err}`);
          } finally {
            setLoading(false);
          }
        }}
        okText="Yes"
        cancelText="No"
      >
        <Button disabled={loading} danger type="text">
          Delete
        </Button>
      </Popconfirm>
    </Space>
  );
}

function toTitle(x) {
  if (!x) {
    return "Unknown";
  }
  if (x == "cashapp") {
    return "Cash App Pay";
  }
  return path_to_title(x)
    .split(/\s+/g)
    .map((word) => capitalize(word))
    .join(" ");
}

const DOTS = "••••";

function PaymentMethod({ paymentMethod }) {
  switch (paymentMethod.type) {
    case "card":
      return <Card paymentMethod={paymentMethod} />;
    case "us_bank_account":
      return (
        <PaymentTitle icon="bank">
          {paymentMethod.us_bank_account.bank_name} {DOTS}{" "}
          {paymentMethod.us_bank_account.last4}
        </PaymentTitle>
      );
    default:
      return (
        <PaymentTitle icon="money-check">
          {toTitle(paymentMethod.type)}
        </PaymentTitle>
      );
  }
}

function Card({ paymentMethod }) {
  return (
    <Flex>
      <PaymentTitle icon={`cc-${paymentMethod.card.brand}`}>
        {toTitle(paymentMethod.card.brand)} {DOTS} {paymentMethod.card.last4}
      </PaymentTitle>
      <div style={{ flex: 1 }} />
      <div style={{ color: "#666", fontSize: "13pt" }}>
        Expires {paymentMethod.card.exp_month} / {paymentMethod.card.exp_year}
      </div>
    </Flex>
  );
}

function PaymentTitle({ children, icon }) {
  return (
    <b style={{ fontSize: "12pt", color: "#666" }}>
      {isIconName(icon) ? (
        <Icon name={icon} style={{ marginRight: "15px", color: "darkblue" }} />
      ) : undefined}{" "}
      {children}
    </b>
  );
}
