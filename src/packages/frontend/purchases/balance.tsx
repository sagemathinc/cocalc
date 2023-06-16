import { Card, Tooltip, Progress, Space, Statistic, Spin } from "antd";
import UnpaidInvoices from "./unpaid-invoices";
import { zIndexTip } from "./payment";

export default function Balance({ balance, quota, style }) {
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
        value={balance}
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
        <Space style={{ marginBottom: "30px" }}>
          {stat}
          {quota != null && quota > 0 && (
            <Tooltip
              title={"Percent of your total spending limit"}
              zIndex={zIndexTip}
            >
              <Progress
                style={{ marginLeft: "30px" }}
                type={"circle"}
                size={"small"}
                percent={Math.round((balance / Math.max(1, quota)) * 100)}
                strokeColor={{ "0%": "blue", "100%": "#ff4d4f" }}
              />
            </Tooltip>
          )}
        </Space>
        <UnpaidInvoices balance={balance} />
      </>
    );
  }
  return (
    <Card title={"Balance"} style={style}>
      {body}{" "}
    </Card>
  );
}
