import { Card, Statistic } from "antd";
import { Support } from "./unpaid-invoices";

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
      <Statistic
        title={"Minimum Balance (USD)"}
        value={minBalance}
        precision={2}
        prefix={"$"}
      />
      <Support>Request change...</Support>
    </Card>
  );
}
