import type { ReactNode } from "react";
import { currency, round2down, round4 } from "@cocalc/util/misc";
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
  const origValue = value;
  if (roundDown) {
    value = round2down(value);
  }

  return (
    <Tooltip
      mouseEnterDelay={0.5}
      zIndex={zIndexTip}
      title={() => (
        <>
          {title} (USD): ${round4(origValue)}
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
