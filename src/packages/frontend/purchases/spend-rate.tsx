import { Card, Statistic, Tooltip } from "antd";
import { moneyToCurrency, toDecimal } from "@cocalc/util/money";

interface Props {
  style?;
  spendRate: number | null;
}

export default function SpendRate({ style, spendRate }: Props) {
  if (spendRate == null) {
    // loading...
    return null;
  }
  const spendRateValue = toDecimal(spendRate);
  return (
    <Card style={{ maxWidth: "300px", ...style }}>
      <Tooltip
        title={`Pay as you go upgrades and compute servers cost ${moneyToCurrency(
          spendRateValue,
          3,
        )}/hour.  Licenses and network data transfer costs are not included above.`}
      >
        <Statistic
          title={"Compute Server Spend Rate (USD)"}
          value={spendRateValue.toDecimalPlaces(2).toNumber()}
          precision={2}
          prefix={"$"}
          suffix={"/hour"}
        />
      </Tooltip>
    </Card>
  );
}
