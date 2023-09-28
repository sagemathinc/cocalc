import { Card, Statistic, Tooltip } from "antd";

interface Props {
  style?;
  spendRate: number | null;
  compact?: boolean;
}

export default function SpendRate({ style, spendRate, compact }: Props) {
  if (spendRate == null) {
    // loading...
    return null;
  }
  return (
    <Card
      style={{ maxWidth: "300px", ...style }}
      title=<>Metered Spending Rate</>
    >
      <Tooltip title={`Exactly $${spendRate} (USD)`}>
        <Statistic
          title={"Metered Spend (USD)"}
          value={spendRate}
          precision={spendRate ? 3 : 2}
          prefix={"$"}
          suffix={"/hour"}
        />
      </Tooltip>
      {!compact && (
        <div style={{ color: "#666" }}>
          Only includes pay-as-you-go purchases (licenses are excluded)
        </div>
      )}
    </Card>
  );
}
