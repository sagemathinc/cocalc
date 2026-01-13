import { Divider, InputNumber, Spin, Tag, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";
import { currency } from "@cocalc/util/misc";
import { zIndexPayAsGo } from "./zindex";
import * as api from "./api";
import MoneyStatistic from "./money-statistic";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";
import { toDecimal } from "@cocalc/util/money";

const zIndex = zIndexPayAsGo + 1;
export const zIndexTip = zIndex + 1;

const DEFAULT_AMOUNT = 10;

interface Props {
  balance?: number; // current account balance
  minAmount?: number; // minimal amount that user must add
  paymentAmount?: number | null;
  totalCost?: number; // optional exact amount of the entire purchase -- just results in another preset tag
  setPaymentAmount: (paymentAmount: number) => void;
}

export default function PaymentConfig({
  balance,
  minAmount = 0,
  paymentAmount,
  totalCost,
  setPaymentAmount,
}: Props) {
  const [minPayment, setMinPayment] = useState<number | undefined>(undefined);
  const updateMinPayment = () => {
    (async () => {
      const minPayment = await api.getMinimumPayment();
      setMinPayment(minPayment);
      if (
        paymentAmount != null &&
        toDecimal(paymentAmount).lt(toDecimal(minPayment ?? 0))
      ) {
        setPaymentAmount(minPayment);
      }
    })();
  };
  useEffect(() => {
    updateMinPayment();
  }, []);

  if (minPayment == null || balance == null) {
    return <Spin />;
  }
  const minPaymentValue = toDecimal(minPayment ?? 0);
  const minAmountValue = toDecimal(minAmount);
  const balanceValue = toDecimal(balance);
  const minRequired = minAmountValue.gt(minPaymentValue)
    ? minAmountValue
    : minPaymentValue;

  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <MoneyStatistic title={"Current Balance"} value={balance} roundDown />
      </div>
      <Divider plain titlePlacement="start">
        Amount in US dollars{" "}
        {minAmount > 0 ? ` (at least ${currency(minAmount)})` : ""}
        <Tooltip
          zIndex={zIndexTip}
          title={
            <>
              {minAmount
                ? `If you enter more than ${currency(
                    minAmount,
                  )}, your account will be credited. `
                : "Your account will be credited. "}
              Credit can be used to purchase anything on our site. Credits are
              nonrefundable, but <b>do not expire</b>.
            </>
          }
        >
          <Icon name="question-circle" style={{ marginLeft: "30px" }} />
        </Tooltip>
      </Divider>
      <div style={{ textAlign: "center" }}>
        {minPayment != null && (
          <div style={{ marginBottom: "15px" }}>
            {minAmountValue.lte(minPaymentValue) && (
              <Preset amount={minPayment} setPaymentAmount={setPaymentAmount}>
                Minimum: {currency(minPayment)}
              </Preset>
            )}
            {minAmountValue.gt(minPaymentValue) && (
              <Preset amount={minAmount} setPaymentAmount={setPaymentAmount}>
                Due: {currency(minAmount)}
              </Preset>
            )}
            {!!totalCost && (
              <Preset amount={totalCost} setPaymentAmount={setPaymentAmount}>
                Total: {currency(totalCost)}
              </Preset>
            )}
            {balanceValue.neg().gte(minRequired) && (
              <Preset
                amount={balanceValue.neg().toNumber()}
                setPaymentAmount={setPaymentAmount}
              >
                Balance: {currency(balanceValue.neg().toNumber())}
              </Preset>
            )}
            {toDecimal(DEFAULT_AMOUNT).gte(minRequired) && (
              <Preset
                amount={DEFAULT_AMOUNT}
                setPaymentAmount={setPaymentAmount}
              >
                ${DEFAULT_AMOUNT}
              </Preset>
            )}
            {toDecimal(20).gte(minRequired) && (
              <Preset amount={20} setPaymentAmount={setPaymentAmount}>
                $20
              </Preset>
            )}
            {toDecimal(50).gte(minRequired) && (
              <Preset amount={50} setPaymentAmount={setPaymentAmount}>
                $50
              </Preset>
            )}
            {toDecimal(100).gte(minRequired) && (
              <Preset amount={100} setPaymentAmount={setPaymentAmount}>
                $100
              </Preset>
            )}
          </div>
        )}
        <InputNumber
          style={{ maxWidth: "200px" }}
          size="large"
          min={minRequired.toNumber()}
          max={MAX_COST}
          precision={2} // for two decimal places
          step={5}
          value={paymentAmount}
          onChange={setPaymentAmount}
          addonBefore="$"
        />
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
