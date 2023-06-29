import type { CSSProperties } from "react";
import { Card, Tooltip, Space, Statistic, Spin } from "antd";
import UnpaidInvoices from "./unpaid-invoices";
import { zIndexTip } from "./payment";
import { round2 } from "@cocalc/util/misc";

interface Props {
  balance?: number | null;
  style?: CSSProperties;
  refresh?: () => void;
}

export default function Balance({ balance, style, refresh }: Props) {
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
      <Statistic
        title={"Current balance (USD)"}
        value={round2(balance)}
        precision={2}
        prefix={"$"}
      />
    );
    if (balance < 0) {
      stat = (
        <Tooltip
          zIndex={zIndexTip}
          title="You have a negative balance.  This is money that you can spend anywhere in CoCalc."
        >
          {stat}
        </Tooltip>
      );
    }
    body = (
      <>
        <Space style={{ marginBottom: "30px" }}>{stat}</Space>
        <UnpaidInvoices balance={balance} refresh={refresh} />
      </>
    );
  }
  return (
    <Card title={"Add Money to Your Account"} style={style}>
      {body}
    </Card>
  );
}
