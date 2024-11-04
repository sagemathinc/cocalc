import { useEffect, useRef, useState } from "react";
import { cancelPaymentIntent, getPayments } from "./api";
import {
  Alert,
  Button,
  Divider,
  Flex,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { FinishStripePayment } from "./stripe-payment";
import { capitalize, currency, replace_all } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { PAYMENT_INTENT_REASONS } from "@cocalc/util/stripe/types";
import "./purchases.css";
import { describeNumberOf } from "./util";

interface Props {
  refresh?: () => Promise<void>;
  refreshPaymentsRef?;
  // if you are an admin and want to view a different user's incomplete payments
  account_id?: string;
}

export default function Payments({
  refresh,
  refreshPaymentsRef,
  account_id,
}: Props) {
  const [error, setError] = useState<string>("");
  const [hasLoadedMore, setHasLoadedMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<null | any[]>(null);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const lastLoadRef = useRef<number>(0);

  const loadMore = async ({
    init,
    reset,
  }: { init?: boolean; reset?: boolean } = {}) => {
    const now = Date.now();
    if (now - lastLoadRef.current < 500) {
      return;
    }
    lastLoadRef.current = now;

    try {
      setError("");
      setLoading(true);
      let result;
      if (init || data == null || reset) {
        result = await getPayments({
          user_account_id: account_id,
          limit: hasLoadedMore ? 100 : 5,
        });
        setData(result.data);
      } else {
        result = await getPayments({
          user_account_id: account_id,
          starting_after: data[data.length - 1].id,
          limit: 100,
        });
        setData(data.concat(result.data));
        setHasLoadedMore(true);
      }
      setHasMore(result.has_more);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMore({ init: true, reset: true });
  }, [account_id]);

  if (refreshPaymentsRef != null) {
    refreshPaymentsRef.current = () => {
      loadMore({ init: true });
    };
  }

  return (
    <div>
      <Flex>
        <div style={{ flex: 1 }}>
          <Divider orientation="left">
            <Tooltip title="These are cash payments to CoCalc from some outside source.">
              {describeNumberOf({
                n: data?.length,
                hasMore,
                loadMore,
                loading,
                type: "payment",
              })}
            </Tooltip>
            {loading && <Spin style={{ marginLeft: "15px" }} />}
          </Divider>
        </div>
        <Button
          style={{ marginTop: "15px" }}
          type="link"
          onClick={() => {
            loadMore({ init: true });
          }}
        >
          <Icon name="refresh" /> Refresh
        </Button>
      </Flex>
      <div>
        <ShowError error={error} setError={setError} />
        {data?.length == 0 && !hasMore && (
          <Alert showIcon type="info" message="No payments" />
        )}
        {data != null && (
          <>
            <PaymentIntentsTable
              paymentIntents={data}
              onFinished={() => {
                loadMore({ init: true });
                refresh?.();
              }}
              account_id={account_id}
              scroll={hasLoadedMore ? { y: 800 } : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}

function PaymentIntentsTable({
  paymentIntents,
  onFinished,
  account_id,
  scroll,
}) {
  const columns = [
    {
      title: "Credit Id",
      render: (_, { intent }) => <>{intent?.metadata?.credit_id}</>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => currency(amount / 100),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        // colors below are from https://docs.stripe.com/payments/paymentintents/lifecycle
        switch (status) {
          case "requires_payment_method":
            return (
              <div>
                <Icon
                  name="credit-card"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Fill in payment details</Tag>
              </div>
            );
          case "requires_confirmation":
            return (
              <div>
                <Icon
                  name="arrow-circle-o-left"
                  rotate="180"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Confirm payment</Tag>
              </div>
            );
          case "requires_action":
            return (
              <div>
                <Icon
                  name="lock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Authenticate your payment</Tag>
              </div>
            );
          case "processing":
            return (
              <div>
                <Icon
                  name="clock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Processing your order...</Tag>
              </div>
            );

          case "succeeded":
            return (
              <div>
                <Icon
                  name="check-circle"
                  style={{ color: "#33c280", marginRight: "5px" }}
                />
                <Tag color="green">Payment successful</Tag>
              </div>
            );

          case "canceled":
            return (
              <div>
                <Icon
                  name="warning"
                  style={{ color: "#ed5f74", marginRight: "5px" }}
                />
                <Tag color="#ed5f74">Order was canceled</Tag>
              </div>
            );

          default:
            return status;
        }
      },
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Date",
      dataIndex: "intent",
      key: "date",
      render: ({ created }) => <TimeAgo date={created * 1000} />,
    },
  ];

  const dataSource = paymentIntents.map((intent) => {
    return {
      key: intent.id,
      status: intent.status,
      amount: intent.amount,
      description: intent.description,
      intent,
    };
  });

  return (
    <Table
      scroll={scroll}
      rowClassName={(record) =>
        record.status != "succeeded" && record.status != "canceled"
          ? "cc-payments-highlight"
          : ""
      }
      pagination={false}
      dataSource={dataSource}
      columns={columns}
      expandable={{
        expandRowByClick: true,
        rowExpandable: (record: any) => {
          return (
            record.intent.status != "succeeded" &&
            record.intent.status != "canceled" &&
            record.intent.status != "processing"
          );
        },
        expandedRowRender: (record: any) => {
          if (!account_id) {
            return (
              <FinishStripePayment
                onFinished={onFinished}
                paymentIntent={record.intent}
              />
            );
          } else {
            // admin
            return (
              <AdminCancelPayment
                id={record.intent.id}
                onFinished={onFinished}
              />
            );
          }
        },
      }}
    />
  );
}

function AdminCancelPayment({ id, onFinished }) {
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");

  const doCancel = async () => {
    try {
      setError("");
      await cancelPaymentIntent({ id, reason });
      onFinished?.();
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <div>
      <Space>
        <Select
          style={{ width: "300px" }}
          options={PAYMENT_INTENT_REASONS.map((value) => {
            return { value, label: capitalize(replace_all(value, "_", " ")) };
          })}
          value={reason}
          onChange={setReason}
        />
        <Popconfirm
          title="Cancel the Payment Request"
          description="Are you sure to cancel this payment request?"
          onConfirm={doCancel}
          cancelText="No"
        >
          <Button type="primary" disabled={!reason}>
            Cancel Payment...
          </Button>
        </Popconfirm>
      </Space>
      <br />
      <ShowError error={error} setError={setError} />
    </div>
  );
}

export function PaymentsButton(props: Props) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <div>
      <Button onClick={() => setShow(!show)}>
        <Icon name="credit-card" /> Payments
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <Payments {...props} />
        </div>
      )}
    </div>
  );
}
