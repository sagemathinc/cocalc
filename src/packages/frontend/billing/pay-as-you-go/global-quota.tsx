import { Card, Tooltip } from "antd";
import { currency } from "./quota-config";

interface Props {
  global;
  style?;
}

export default function GlobalQuota({ global, style }: Props) {
  if (global == null) {
    return null;
  }
  const { quota, why, increase } = global;
  return (
    <Tooltip title="No service limit can exceed the global limit, and you can't spend more than this amount per billing period without making an extra payment.  Contact support to increase this limit.">
      <Card style={style}>
        Global Spending Limit: {currency(quota)}
        <br />
        {why}
        <br />
        {increase == "add-card" && "TODO: add a card here"}
        {increase == "support" && "TODO: support request here"}
        {increase == "verify-email" && "TODO: why to verify email here"}
      </Card>
    </Tooltip>
  );
}
