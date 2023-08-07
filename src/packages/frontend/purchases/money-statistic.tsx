import type { ReactNode } from "react";
import { round2 } from "@cocalc/util/misc";
import { Statistic } from "antd";

interface Props {
  value: number;
  title: ReactNode;
}
export default function MoneyStatistic({ value, title }: Props) {
  return (
    <Statistic
      title={<>{title} (USD)</>}
      value={round2(value)}
      precision={2}
      prefix={"$"}
    />
  );
}
