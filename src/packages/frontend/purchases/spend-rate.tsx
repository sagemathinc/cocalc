import { Card, Statistic, Tooltip } from "antd";
import { currency } from "@cocalc/util/misc";
import { round2 } from "@cocalc/util/misc";

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
    <Card style={{ maxWidth: "300px", ...style }}>
      <Tooltip
        title={`Pay as you go upgrades and compute servers cost ${currency(
          spendRate,
          3,
        )}/hour.  Licenses and network data transfer costs are not included above.`}
      >
        <Statistic
          title={"Compute Server Spend Rate (USD)"}
          value={round2(spendRate)}
          precision={2}
          prefix={"$"}
          suffix={"/hour"}
        />
      </Tooltip>
    </Card>
  );
}
