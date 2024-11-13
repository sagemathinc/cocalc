import type { CSSProperties } from "react";
import { useState } from "react";
import { Alert, Button, Card, Tooltip, Space, Spin } from "antd";
import { zIndexTip } from "./zindex";
import MoneyStatistic from "./money-statistic";
import { currency } from "@cocalc/util/misc";
import Payment from "./payment";
import Next from "@cocalc/frontend/components/next";
import { Icon } from "@cocalc/frontend/components/icon";
import AutoBalance from "./auto-balance";

interface Props {
  balance?: number | null;
  style?: CSSProperties;
  refresh?: Function;
  cost?: number; // optional amount of money we want right now
  pendingBalance?: number | null;
  showTransferLink?: boolean;
  defaultAdd?: boolean;
}

export default function Balance({
  balance,
  style,
  refresh,
  cost,
  pendingBalance,
  showTransferLink,
  defaultAdd,
}: Props) {
  const [add, setAdd] = useState<boolean>(!!defaultAdd);
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
      <MoneyStatistic title={"Current Balance"} value={balance} roundDown />
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

    if (!add) {
      body = (
        <div>
          {stat}
          <Button
            type="primary"
            size="large"
            onClick={() => setAdd(true)}
            style={{ marginTop: "5px" }}
          >
            <Icon name="credit-card" style={{ marginRight: "5px" }} />
            Deposit Money
          </Button>
          <div style={{ marginTop: "15px" }}>
            <Space>
              <AutoBalance
                type="link"
                style={{ marginLeft: "-15px" /* so link looks centered */ }}
              />
              {showTransferLink && balance > 0 && (
                <Next href={"store/vouchers"}>Vouchers</Next>
              )}
            </Space>
          </div>
        </div>
      );
    } else {
      body = (
        <>
          <Button
            onClick={() => setAdd(false)}
            style={{ position: "absolute", right: "15px" }}
          >
            Cancel
          </Button>
          <Payment
            balance={balance}
            update={() => {
              refresh?.();
              setAdd(false);
            }}
            cost={cost}
          />
          {pendingBalance != null && pendingBalance < 0 && (
            <Tooltip title="Pending charges are not included in your spending limit.  They need to be paid soon by a credit to your account.">
              <div style={{ maxWidth: "200px", color: "#666" }}>
                <Alert
                  showIcon
                  style={{ marginTop: "10px", textAlign: "left" }}
                  type="warning"
                  message={
                    <Tooltip
                      title={
                        <div>
                          You have {currency(pendingBalance)} in pending
                          transactions for subscription renewals. These have not
                          completed yet and are not included in your balance.
                          Ensure you have automatic payments configured or add
                          credit to your account so that your subscriptions will
                          not be cancelled.
                        </div>
                      }
                    >
                      <b>{currency(pendingBalance)} in pending transactions</b>{" "}
                      not included in balance
                    </Tooltip>
                  }
                />
              </div>
            </Tooltip>
          )}
        </>
      );
    }
  }
  return <Card style={style}>{body}</Card>;
}
