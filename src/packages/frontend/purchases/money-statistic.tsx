import type { ReactNode } from "react";
import { round2, round3 } from "@cocalc/util/misc";
import { Tooltip, Statistic } from "antd";

interface Props {
  value: number;
  title: ReactNode;
}
export default function MoneyStatistic({ value, title }: Props) {
  let body;
  if (value >= 0.0095) {
    body = (
      <Statistic
        title={<>{title} (USD)</>}
        value={round2(value)}
        precision={2}
        prefix={"$"}
      />
    );
  } else {
    body = (
      <Statistic
        title={<>{title} (USD)</>}
        value={round3(value)}
        precision={3}
        prefix={"$"}
      />
    );
  }

  return <Tooltip title={`Exactly $${value} (USD)`}>{body}</Tooltip>;
}
