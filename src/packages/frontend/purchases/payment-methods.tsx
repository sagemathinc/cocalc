import { Button, Flex, Popconfirm, Space, Table, Tag } from "antd";
import { ReactNode, useEffect, useState } from "react";

import {
  getPaymentMethods,
  setDefaultPaymentMethod as setDefaultPaymentMethodUsingApi,
  deletePaymentMethod,
} from "./api";
import { BigSpin } from "./stripe-payment";
import { describeNumberOf, SectionDivider, RawJson } from "./util";
import ShowError from "@cocalc/frontend/components/error";
import { Icon, isIconName } from "@cocalc/frontend/components/icon";
import { capitalize, path_to_title } from "@cocalc/util/misc";
import { AddPaymentMethodButton } from "./stripe-payment";
import { AddressButton } from "./address";
import { COLORS } from "@cocalc/util/theme";

type PaymentMethod = any;

// NOTE: this is also used in next.js. We can't load UseBalance here, hence we inject it via balanceComponent
export default function PaymentMethods({
  balanceComponent,
}: {
  balanceComponent?: ReactNode;
}) {
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
      <SectionDivider
        loading={loading}
        onRefresh={() => {
          init({ limit: paymentMethods?.length ?? 5 });
        }}
      >
        {describeNumberOf({
          n: paymentMethods?.length,
          hasMore,
          loadMore: () => {
            loadMore({ paymentMethods, limit: 10 });
          },
          loading,
          type: "Payment Method",
        })}
      </SectionDivider>
      <ShowError error={error} setError={setError} />
      {paymentMethods != null && (
        <Table
          dataSource={paymentMethods}
          pagination={false}
          rowKey={"id"}
          columns={[
            {
              title: (
                <>
                  Payment Method{" "}
                  <span style={{ marginLeft: "30px" }}>
                    <Space>
                      <AddPaymentMethodButton
                        onFinished={() => {
                          init({ limit: paymentMethods.length + 1 });
                        }}
                      />
                      <AddressButton />
                    </Space>
                  </span>
                </>
              ),
              dataIndex: "id",
              key: "id",
              render: (_, record) => (
                <PaymentMethod
                  paymentMethod={record}
                  isDefault={defaultPaymentMethod == record.id}
                />
              ),
            },
            {
              title: (
                <div style={{ marginLeft: "15px", textAlign: "center" }}>
                  Actions
                </div>
              ),
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
              return <RawJson value={record} defaultOpen />;
            },
          }}
        />
      )}
      {balanceComponent}
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
      <div style={{ width: "150px", textAlign: "center" }}>
        {!isDefault ? (
          <Button
            disabled={loading}
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
        ) : (
          <b>
            <Tag color="blue">Default</Tag>
          </b>
        )}
      </div>
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

export function PaymentMethod({
  paymentMethod,
  isDefault,
  compact,
}: {
  paymentMethod;
  isDefault?;
  compact?: boolean;
}) {
  switch (paymentMethod.type) {
    case "card":
      const icon = `cc-${paymentMethod.card.brand}`;
      const title = (
        <PaymentTitle
          icon={isIconName(icon) ? icon : "credit-card"}
          isDefault={isDefault}
        >
          {toTitle(
            paymentMethod.card.display_brand ?? paymentMethod.card.brand,
          )}{" "}
          {DOTS} {paymentMethod.card.last4}
        </PaymentTitle>
      );
      if (compact) {
        return title;
      }
      return (
        <Flex>
          {title}
          <div style={{ flex: 1 }} />
          <div style={{ color: "#666", fontSize: "13pt" }}>
            Expires {paymentMethod.card.exp_month} /{" "}
            {paymentMethod.card.exp_year}
          </div>
        </Flex>
      );
    case "us_bank_account":
      return (
        <PaymentTitle icon="bank" isDefault={isDefault}>
          {paymentMethod.us_bank_account.bank_name} {DOTS}{" "}
          {paymentMethod.us_bank_account.last4}
        </PaymentTitle>
      );
    case "cashapp":
      return (
        <PaymentTitle isDefault={isDefault}>
          <IconLetter
            style={{
              fontStyle: "italic",
              background: "#00d64f",
              color: "white",
            }}
          >
            $
          </IconLetter>{" "}
          Cash App Pay
        </PaymentTitle>
      );
    case "link":
      return (
        <PaymentTitle isDefault={isDefault}>
          <IconLetter
            style={{
              background: "#00d66f",
              color: "black",
              fontWeight: "bold",
            }}
          >
            &gt;
          </IconLetter>{" "}
          {toTitle(paymentMethod.type)}{" "}
          {paymentMethod.link?.email ? ` - ${paymentMethod.link?.email}` : ""}
        </PaymentTitle>
      );
    default:
      // some things have this
      const last4 = paymentMethod[paymentMethod.type]?.["last4"];
      return (
        <PaymentTitle icon="money-check" isDefault={isDefault}>
          {toTitle(paymentMethod.type)}
          {last4 != null ? ` ${DOTS} ${last4}` : ""}
        </PaymentTitle>
      );
  }
}

function IconLetter({ style, children }) {
  return (
    <div
      style={{
        display: "inline-block",
        width: "20px",
        padding: "5px",
        marginRight: "5px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PaymentTitle({
  children,
  icon,
  isDefault,
}: {
  children;
  icon?;
  isDefault?;
}) {
  return (
    <b style={{ fontSize: "12pt", color: COLORS.GRAY_M }}>
      {icon != null && (
        <Icon name={icon} style={{ width: "25px", color: "darkblue" }} />
      )}{" "}
      {children}
      {!!isDefault && (
        <Tag color="blue" style={{ marginLeft: "15px" }}>
          Default
        </Tag>
      )}
    </b>
  );
}
