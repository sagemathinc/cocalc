import { Card, Tooltip, Progress, Space, Statistic, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import Payment from "./payment";

export default function Balance({ balance, quota, style }) {
  return (
    <Card title={"Balance"} style={style}>
      {balance == null ? (
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
      ) : (
        <>
          <Space>
            <Statistic
              title={"Current balance (USD)"}
              value={balance}
              precision={2}
              prefix={"$"}
            />
            {quota && (
              <Tooltip title={"Percent of your total spending limit"}>
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
          {balance < 0 && (
            <div style={{ marginTop: "30px" }}>
              <Icon name="check" style={{ color: "darkgreen" }} /> A negative
              balance is a credit.
            </div>
          )}
          <hr />
          <Payment balance={balance} />
        </>
      )}
    </Card>
  );
}
