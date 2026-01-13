import type { ReactNode } from "react";
import {
  moneyRound2Down,
  moneyToCurrency,
  toDecimal,
  type MoneyValue,
} from "@cocalc/util/money";
import { Tooltip, Statistic } from "antd";
import { zIndexTip } from "./zindex";

interface Props {
  value: MoneyValue;
  title: ReactNode;
  costPerMonth?: MoneyValue;
  roundDown?: boolean;
}
export default function MoneyStatistic({
  value,
  title,
  costPerMonth,
  roundDown,
}: Props) {
  const origValue = toDecimal(value);
  const displayValue = roundDown
    ? moneyRound2Down(origValue).toNumber()
    : origValue.toNumber();

  return (
    <Tooltip
      mouseEnterDelay={0.5}
      zIndex={zIndexTip}
      title={() => (
        <>
          {title} (USD): ${origValue.toDecimalPlaces(4).toNumber()}
          {costPerMonth ? (
            <>
              <br /> Cost per month (USD): {moneyToCurrency(costPerMonth)}
            </>
          ) : (
            ""
          )}
        </>
      )}
    >
      <Statistic
        title={<>{title} (USD)</>}
        value={displayValue}
        precision={2}
        prefix={"$"}
      />
    </Tooltip>
  );
}
