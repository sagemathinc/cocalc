import { type CSSProperties, useState } from "react";
import { getOpenPaymentIntents } from "./api";
import useAsyncLoad from "@cocalc/frontend/misc/use-async-load";
import { Alert, Button, Space } from "antd";
import { FinishStripePayment } from "./stripe-payment";
import { plural } from "@cocalc/util/misc";

interface Props {
  style?: CSSProperties;
  refresh?: () => Promise<void>;
}

export default function IncompletePayments({ refresh, style }: Props) {
  const {
    component,
    result,
    loading,
    refresh: reload,
  } = useAsyncLoad<any>({
    f: getOpenPaymentIntents,
    throttleWait: 5000,
    refreshStyle: { float: "right" },
  });

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
          showIcon
          type="warning"
          message={`You have ${result?.length} incomplete outstanding ${plural(result?.length, "payment")}.`}
        />
      )}
      {result?.map((paymentIntent) => (
        <PaymentIntent
          paymentIntent={paymentIntent}
          key={paymentIntent.id}
          onFinished={() => {
            reload();
            refresh?.();
          }}
        />
      ))}
    </div>
  );
}

function PaymentIntent({ paymentIntent, onFinished }) {
  const [pay, setPay] = useState<boolean>(false);
  const { id, status } = paymentIntent;
  return (
    <div>
      <Space>
        {id} {status}
      </Space>
      <Button
        onClick={() => {
          setPay(!pay);
        }}
      >
        Pay
      </Button>
      {pay && (
        <FinishStripePayment
          onFinished={onFinished}
          paymentIntent={paymentIntent}
        />
      )}
    </div>
  );
}
