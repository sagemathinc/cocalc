import { Divider, Tag } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";
import { currency } from "@cocalc/util/misc";
import { toDecimal } from "@cocalc/util/money";
import { zIndexPayAsGo } from "./zindex";
import * as api from "./api";
import PaymentConfig from "./payment-config";
import StripePayment, { BigSpin } from "./stripe-payment";

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
  const [initialized, setInitialized] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const minPayment = await api.getMinimumPayment();
      const minPaymentValue = toDecimal(minPayment ?? 0);
      const costValue = cost != null ? toDecimal(cost) : null;
      const balanceValue = toDecimal(balance ?? 0);
      const negativeBalance = balanceValue.lt(0)
        ? balanceValue.neg()
        : toDecimal(0);
      const paymentValue = costValue
        ? minPaymentValue.gt(costValue)
          ? minPaymentValue
          : costValue
        : minPaymentValue.gt(negativeBalance)
          ? minPaymentValue
          : negativeBalance;
      setPaymentAmount(paymentValue.toNumber());
      setInitialized(true);
    })();
  }, [balance, cost]);

  if (!initialized) {
    return <BigSpin />;
  }

  return (
    <div>
      <h3>
        <Icon name="credit-card" style={{ marginRight: "10px" }} />
        {cost
          ? `Add at least ${currency(cost)} (plus tax) to your account`
          : "Make a Deposit"}
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
            <div>
              <div
                style={{
                  margin: "auto",
                  maxWidth: "800px",
                  background: "white",
                  padding: "30px 0",
                }}
              >
                <StripePayment
                  lineItems={[
                    {
                      description: "Credit your account",
                      amount: paymentAmount,
                    },
                  ]}
                  description={`Add ${currency(paymentAmount)} to your account from within the CoCalc app.`}
                  purpose={"add-credit"}
                  onFinished={() => {
                    update?.();
                    setFinished(true);
                  }}
                />
              </div>
            </div>
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
