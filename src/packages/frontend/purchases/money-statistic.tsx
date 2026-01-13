import type { ReactNode } from "react";
import { currency } from "@cocalc/util/misc";
import { moneyRound2Down, toDecimal } from "@cocalc/util/money";
import { Tooltip, Statistic } from "antd";
import { zIndexTip } from "./zindex";

interface Props {
  value: number;
  title: ReactNode;
  costPerMonth?: number;
  roundDown?: boolean;
}
export default function MoneyStatistic({
  value,
  title,
  costPerMonth,
  roundDown,
}: Props) {
  const origValue = toDecimal(value);
  if (roundDown) {
    value = moneyRound2Down(value).toNumber();
  }

  return (
    <Tooltip
      mouseEnterDelay={0.5}
      zIndex={zIndexTip}
      title={() => (
        <>
          {title} (USD): ${origValue.toDecimalPlaces(4).toNumber()}
          {costPerMonth ? (
            <>
              <br /> Cost per month (USD): {currency(costPerMonth)}
            </>
          ) : (
            ""
          )}
        </>
      )}
    >
      <Statistic
        title={<>{title} (USD)</>}
        value={value}
        precision={2}
        prefix={"$"}
      />
    </Tooltip>
  );
}
