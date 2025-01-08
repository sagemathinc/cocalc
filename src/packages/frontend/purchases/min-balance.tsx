import { Card, Space, Tooltip } from "antd";
import Support from "./support";
import MoneyStatistic from "./money-statistic";
import ClosingDate from "./closing-date";
import { Icon } from "@cocalc/frontend/components/icon";

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
      <Space direction="vertical">
        <ClosingDate type="link" />
        <Support>
          <Tooltip title="Create support request to allow your balance to be negative for Pay As You Go purchases.  This is useful if you use compute servers a lot.">
            <Icon name="rise-outlined" rotate="90" /> Allow Negative
          </Tooltip>
        </Support>
      </Space>
    </Card>
  );
}
