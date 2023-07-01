import type { CSSProperties } from "react";
import { Card, Tooltip, Space, Spin } from "antd";
import UnpaidInvoices from "./unpaid-invoices";
import { zIndexTip } from "./payment";
import MoneyStatistic from "./money-statistic";

interface Props {
  balance?: number | null;
  style?: CSSProperties;
  refresh?: () => void;
  cost?: number; // optional amount of money we want right now
}

export default function Balance({ balance, style, refresh, cost }: Props) {
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
      <MoneyStatistic title={"Current Balance (USD)"} value={balance} />
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
        <UnpaidInvoices balance={balance} refresh={refresh} cost={cost} />
      </>
    );
  }
  return (
    <Card title={"Add Money to Your Account"} style={style}>
      {body}
    </Card>
  );
}
