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
    <Card style={style} title="Balance Cannot Go Below">
      <MoneyStatistic title={"Minimum Balance"} value={minBalance} />
      <Support>Request Smaller Minimum...</Support>
    </Card>
  );
}
