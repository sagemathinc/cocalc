import { type CSSProperties } from "react";
import { getOpenPaymentIntents } from "./api";
import useAsyncLoad from "@cocalc/frontend/misc/use-async-load";
import { Alert, Table } from "antd";
import { FinishStripePayment } from "./stripe-payment";
import { currency, plural } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  style?: CSSProperties;
  refresh?: () => Promise<void>;
  refreshPaymentsRef?;
}

export default function IncompletePayments({
  refresh,
  style,
  refreshPaymentsRef,
}: Props) {
  const {
    component,
    result,
    loading,
    refresh: reload,
  } = useAsyncLoad<any>({
    f: getOpenPaymentIntents,
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
          message={`You have ${result?.length} incomplete outstanding ${plural(result?.length, "payment")}.  Successful payments take a few minutes to process.`}
        />
      )}
      {result?.length > 0 && (
        <PaymentIntentsTable
          paymentIntents={result}
          onFinished={() => {
            reload();
            refresh?.();
          }}
        />
      )}
    </div>
  );
}

function PaymentIntentsTable({ paymentIntents, onFinished }) {
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
        expandedRowRender: (record: any) => (
          <FinishStripePayment
            onFinished={onFinished}
            paymentIntent={record.intent}
          />
        ),
      }}
    />
  );
}
