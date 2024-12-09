import { Button, Popconfirm, Spin } from "antd";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { cancelPaymentIntent } from "./api";

export default function CancelPaymentIntent({ paymentIntentId, ...props }) {
  const [canceling, setCanceling] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const cancelOrder = async () => {
    try {
      setError("");
      setCanceling(true);
      await cancelPaymentIntent({
        id: paymentIntentId,
        reason: "requested_by_customer",
      });
      props.onCancel?.();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setCanceling(false);
    }
  };
  return (
    <div>
      <Popconfirm
        onConfirm={cancelOrder}
        title={"Cancel this Payment?"}
        description={
          <div style={{ maxWidth: "400px" }}>
            Manually cancel this payment? Relevant subscriptions will be
            canceled, store items returned to your cart, etc.
          </div>
        }
      >
        <Button danger {...props}>
          Cancel Payment {canceling && <Spin />}
        </Button>
      </Popconfirm>
      <ShowError
        error={error}
        style={{ marginTop: "15px", width: "500px" }}
        setError={setError}
      />
    </div>
  );
}
