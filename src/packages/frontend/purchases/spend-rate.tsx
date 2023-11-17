import { Card, Statistic, Tooltip } from "antd";
import { currency } from "@cocalc/util/misc";

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
      <Tooltip
        title={`Your pay as you go upgrades and compute servers cost $${currency(
          spendRate,
          3,
        )}/hour.`}
      >
        <Statistic
          title={"Metered Spend (USD)"}
          value={spendRate}
          precision={2}
          prefix={"$"}
          suffix={"/hour"}
        />
      </Tooltip>
      {!compact && (
        <div style={{ color: "#666" }}>
          Licenses and network data transfer costs are not included above.
        </div>
      )}
    </Card>
  );
}
