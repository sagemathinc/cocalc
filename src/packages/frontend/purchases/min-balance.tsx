import { Card } from "antd";
import Support from "./support";
import MoneyStatistic from "./money-statistic";

interface Props {
  minBalance?: number | null;
  style?;
}

export default function MinBalance({ minBalance, style }: Props) {
  if (minBalance == null) {
    // loading...
    return null;
  }
  return (
    <Card style={style}>
      <MoneyStatistic title={"Minimum Balance"} value={minBalance} />
      <Support style={{ fontSize: "12pt" }}>Allow Negative</Support>
    </Card>
  );
}
