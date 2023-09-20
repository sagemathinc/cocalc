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
    <Card style={{ maxWidth: "300px", ...style }} title=<>Spending Rate</>>
      <Statistic
        title={"Metered Spend (USD)"}
        value={spendRate}
        precision={spendRate ? 3 : 2}
        prefix={"$"}
        suffix={"/hour"}
      />
      <div style={{ color: "#666" }}>
        Only includes pay-as-you-go purchases (licenses are excluded)
      </div>
    </Card>
  );
}
