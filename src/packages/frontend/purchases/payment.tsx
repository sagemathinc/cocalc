import { Divider, Spin, Tag } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";
import { currency } from "@cocalc/util/misc";
import { zIndexPayAsGo } from "./zindex";
import * as api from "./api";
import PaymentConfig from "./payment-config";
import StripePayment from "./stripe-payment";

const zIndex = zIndexPayAsGo + 1;
export const zIndexTip = zIndex + 1;

interface Props {
  balance: number;
  update?: Function;
  cost?: number; // optional amount that we want to encourage the user to pay
}

export default function Payment({ balance, update, cost }: Props) {
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [finished, setFinished] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const minPayment = await api.getMinimumPayment();
      setPaymentAmount(
        cost
          ? Math.max(minPayment, cost)
          : Math.max(
              minPayment ?? 0,
              balance != null && balance < 0 ? -balance : 0,
            ),
      );
    })();
  }, [balance, cost]);

  if (paymentAmount == null) {
    return <Spin />;
  }

  return (
    <div>
      <h3>
        <Icon name="credit-card" style={{ marginRight: "5px" }} />
        {cost
          ? `Add at least ${currency(cost)} (plus tax) to your account...`
          : "Add Money..."}
      </h3>
      <div>
        {balance != null && (
          <PaymentConfig
            balance={balance}
            paymentAmount={paymentAmount}
            setPaymentAmount={setPaymentAmount}
            minAmount={cost}
          />
        )}
        {!!paymentAmount && !finished && (
          <div>
            <Divider />
            <StripePayment
              amount={paymentAmount}
              description="Add money to your account."
              purpose={"add-credit"}
              onFinished={() => {
                update?.();
                setFinished(true);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function Preset({ amount, setPaymentAmount, children }) {
  return (
    <Tag
      style={{ cursor: "pointer", marginBottom: "5px" }}
      color="blue"
      onClick={() => setPaymentAmount(amount)}
    >
      {children}
    </Tag>
  );
}
