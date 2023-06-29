import { Card, Statistic } from "antd";

interface Props {
  style?;
  spendRate: number | null;
}

export default function SpendRate({ style, spendRate }: Props) {
  if (spendRate == null) {
    // loading...
    return null;
  }
  return (
    <Card style={style} title=<>Spending Rate</>>
      <Statistic
        title={"Metered Spend (USD)"}
        value={spendRate}
        precision={3}
        prefix={"$"}
        suffix={"/hour"}
      />
    </Card>
  );
}
