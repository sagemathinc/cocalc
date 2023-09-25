import type { CSSProperties } from "react";
import { Card, Divider, Tooltip, Space, Spin } from "antd";
import { zIndexTip } from "./payment";
import MoneyStatistic from "./money-statistic";
import { currency } from "@cocalc/util/misc";
import Payment from "./payment";

interface Props {
  balance?: number | null;
  style?: CSSProperties;
  refresh?: () => void;
  cost?: number; // optional amount of money we want right now
  pendingBalance?: number | null;
}

export default function Balance({
  balance,
  style,
  refresh,
  cost,
  pendingBalance,
}: Props) {
  let body;
  if (balance == null) {
    body = (
      <div
        style={{
          height: "125px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Spin delay={1000} size="large" />
      </div>
    );
  } else {
    let stat = (
      <MoneyStatistic title={"Current Balance"} value={balance} />
    );
    if (balance < 0) {
      stat = (
        <Tooltip
          zIndex={zIndexTip}
          title="You have a negative balance (an account credit).  This is money that you can spend anywhere in CoCalc."
        >
          {stat}
        </Tooltip>
      );
    }
    body = (
      <>
        <Space style={{ marginBottom: "30px" }}>{stat}</Space>
        <Payment balance={balance} update={refresh} cost={cost} />
        {pendingBalance != null && pendingBalance < 0 && (
          <Tooltip title="Pending charges are not included in your spending limit.  They need to be paid soon by a credit to your account.">
            <div style={{ maxWidth: "200px", color: "#666" }}>
              <Divider />
              You have <b>
                {currency(-pendingBalance)} in pending charges
              </b>{" "}
              that are not included in the above balance.
            </div>
          </Tooltip>
        )}
      </>
    );
  }
  return (
    <Card title={"Balance"} style={style}>
      {body}
    </Card>
  );
}
