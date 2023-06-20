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
  const { quota, increase, why } = global;
  return (
    <Card style={style} title="Spending Limit">
      <Statistic
        title={"Spending Limit (USD)"}
        value={quota}
        precision={2}
        prefix={"$"}
      />
      {why}
      <br />
      {increase == "verify-email" &&
        "Verify your email address in account preferences to increase your spending limit."}
      {increase == "credit" &&
        "Make a payment to increase your spending limit."}
      <br />
      <Support>Request increase...</Support>
    </Card>
  );
}

export function Support({ children }) {
  return (
    <A
      href={getSupportURL({
        body: "Please raise my spending limit.\n\nTELL US WHO YOU ARE AND EXPLAIN YOUR USE CASE.  THANKS!",
        subject: "Spending Limit Increase Request",
        type: "question",
        hideExtra: true,
      })}
    >
      {children}
    </A>
  );
}
