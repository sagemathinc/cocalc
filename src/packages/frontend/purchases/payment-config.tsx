import { Divider, InputNumber, Space, Spin, Tag, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";
import { currency } from "@cocalc/util/misc";
import { zIndex as zIndexPayAsGo } from "./pay-as-you-go/consts";
import * as api from "./api";
import MoneyStatistic from "./money-statistic";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";

const zIndex = zIndexPayAsGo + 1;
export const zIndexTip = zIndex + 1;

const DEFAULT_AMOUNT = 10;

interface Props {
  balance?: number; // current account balance
  minAmount?: number; // minimal amount that user must add
  paymentAmount: number;
  setPaymentAmount: (paymentAmount: number) => void;
}

export default function PaymentConfig({
  balance,
  minAmount = 0,
  paymentAmount,
  setPaymentAmount,
}: Props) {
  const [minPayment, setMinPayment] = useState<number | undefined>(undefined);
  const updateMinPayment = () => {
    (async () => {
      setMinPayment(await api.getMinimumPayment());
    })();
  };
  useEffect(() => {
    updateMinPayment();
  }, []);

  if (minPayment == null || balance == null) {
    return <Spin />;
  }

  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <MoneyStatistic title={"Current Balance"} value={balance} />
      </div>
      <Divider plain orientation="left">
        Enter amount in US dollars{" "}
        {minAmount > 0 ? ` (at least ${currency(minAmount)})` : ""}
        <Tooltip
          zIndex={zIndexTip}
          title={`If you enter more than ${currency(
            minAmount
          )}, your account will be credited.  Credit can be used to purchase anything on our site.  These credits are nonrefundable, but do not expire.`}
        >
          <Icon name="question-circle" style={{ marginLeft: "30px" }} />
        </Tooltip>
      </Divider>
      <div style={{ textAlign: "center" }}>
        {minPayment != null && (
          <div style={{ marginBottom: "15px" }}>
            {minAmount <= minPayment && (
              <Preset amount={minPayment} setPaymentAmount={setPaymentAmount}>
                Minimum: {currency(minPayment)}
              </Preset>
            )}
            {minAmount > minPayment && (
              <Preset amount={minAmount} setPaymentAmount={setPaymentAmount}>
                Due: {currency(minAmount)}
              </Preset>
            )}
            {-balance >= Math.max(minAmount, minPayment) && (
              <Preset amount={-balance} setPaymentAmount={setPaymentAmount}>
                Balance: {currency(-balance)}
              </Preset>
            )}
            {DEFAULT_AMOUNT >= Math.max(minAmount, minPayment) && (
              <Preset
                amount={DEFAULT_AMOUNT}
                setPaymentAmount={setPaymentAmount}
              >
                ${DEFAULT_AMOUNT}
              </Preset>
            )}
            {20 >= Math.max(minAmount, minPayment) && (
              <Preset amount={20} setPaymentAmount={setPaymentAmount}>
                $20
              </Preset>
            )}
            {100 >= Math.max(minAmount, minPayment) && (
              <Preset amount={100} setPaymentAmount={setPaymentAmount}>
                $100
              </Preset>
            )}
          </div>
        )}
        <Space>
          <InputNumber
            min={Math.max(minAmount, minPayment)}
            max={MAX_COST}
            precision={2} // for two decimal places
            step={5}
            value={paymentAmount}
            onChange={setPaymentAmount}
            addonAfter="$"
          />
        </Space>
        <div style={{ color: "#888", marginTop: "8px" }}>
          (amount excludes applicable taxes)
        </div>
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
