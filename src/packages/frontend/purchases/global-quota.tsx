import { Card, Statistic } from "antd";
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
    <Card style={style} title="Total Spending Limit">
      <Statistic
        title={"Total spending Limit (USD)"}
        value={quota}
        precision={2}
        prefix={"$"}
      />
      {why}
      <br />
      {increase == "add-card" && "TODO: add a card here"}
      {increase == "support" && (
        <A
          href={getSupportURL({
            body: "Please raise my total spending limit.\n\nTELL US WHO YOU ARE AND EXPLAIN YOUR USE CASE.  THANKS!",
            subject: "Total Spending Limit Increase Request",
            type: "question",
            hideExtra: true,
          })}
        >
          Request increase...
        </A>
      )}
      {increase == "verify-email" && "TODO: why to verify email here"}
    </Card>
  );
}
