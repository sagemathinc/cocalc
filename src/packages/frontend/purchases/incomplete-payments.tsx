import { type CSSProperties, useState } from "react";
import { cancelPaymentIntent, getOpenPaymentIntents } from "./api";
import useAsyncLoad from "@cocalc/frontend/misc/use-async-load";
import { Alert, Button, Popconfirm, Select, Space, Table } from "antd";
import { FinishStripePayment } from "./stripe-payment";
import { capitalize, currency, plural, replace_all } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { PAYMENT_INTENT_REASONS } from "@cocalc/util/stripe/types";

interface Props {
  style?: CSSProperties;
  refresh?: () => Promise<void>;
  refreshPaymentsRef?;
  // if you are an admin and want to view a different user's incomplete payments
  account_id?: string;
}

export default function IncompletePayments({
  refresh,
  style,
  refreshPaymentsRef,
  account_id,
}: Props) {
  const {
    component,
    result,
    loading,
    refresh: reload,
  } = useAsyncLoad<any>({
    f: async () => getOpenPaymentIntents({ user_account_id: account_id }),
    throttleWait: 5000,
    refreshStyle: { float: "right", margin: "5px 0 0 15px" },
  });

  if (refreshPaymentsRef != null) {
    refreshPaymentsRef.current = reload;
  }

  if (loading) {
    return component;
  }

  return (
    <div style={style}>
      {component}
      {result?.length == 0 && (
        <Alert
          showIcon
          type="success"
          message="All outstanding payments are complete!"
        />
      )}
      {result?.length > 0 && (
        <Alert
          style={{ margin: "15px 0", textAlign: "left" }}
          showIcon
          type="warning"
          message={`${account_id ? "User has " : "You have "} ${result?.length} incomplete outstanding ${plural(result?.length, "payment")}.  Successful payments take a few minutes to process.`}
        />
      )}
      {result?.length > 0 && (
        <PaymentIntentsTable
          paymentIntents={result}
          onFinished={() => {
            reload();
            refresh?.();
          }}
          account_id={account_id}
        />
      )}
    </div>
  );
}

function PaymentIntentsTable({ paymentIntents, onFinished, account_id }) {
  const columns = [
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
                Fill in your payment details
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
                Confirm payment
              </div>
            );
          case "requires_action":
            return (
              <div>
                <Icon
                  name="lock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                Authenticate your payment method
              </div>
            );
          case "processing":
            return (
              <div>
                <Icon
                  name="clock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                Processing your order...
              </div>
            );

          case "succeeded":
            return (
              <div>
                <Icon
                  name="check-circle"
                  style={{ color: "#33c280", marginRight: "5px" }}
                />
                Payment successful
              </div>
            );

          case "canceled":
            return (
              <div>
                <Icon
                  name="warning"
                  style={{ color: "#ed5f74", marginRight: "5px" }}
                />
                Your order was canceled
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

export function IncompletePaymentsButton(props: Props) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <div>
      <Button onClick={() => setShow(!show)}>
        <Icon name="credit-card" /> Incomplete Payments...
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <IncompletePayments {...props} />
        </div>
      )}
    </div>
  );
}
