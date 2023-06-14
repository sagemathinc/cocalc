import { Card, Tooltip } from "antd";
import { currency } from "./quota-config";
import { A } from "@cocalc/frontend/components/A";
import getSupportURL from "@cocalc/frontend/support/url";

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
    <Tooltip title="You can't spend more than the global limit per billing period without making an extra payment.  Contact support to increase this limit.">
      <Card style={style}>
        Global Limit: {currency(quota)}
        <br />
        {why}
        <br />
        {increase == "add-card" && "TODO: add a card here"}
        {increase == "support" && (
          <A
            href={getSupportURL({
              body: "Please raise my global spending limit.\n\nTELL US WHO YOU ARE AND EXPLAIN YOUR USE CASE.  THANKS!",
              subject: "Global Spending Limit Increase",
              type: "question",
              hideExtra: true,
            })}
          >
            Request increase...
          </A>
        )}
        {increase == "verify-email" && "TODO: why to verify email here"}
      </Card>
    </Tooltip>
  );
}
