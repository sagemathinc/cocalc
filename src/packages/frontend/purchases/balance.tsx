import type { CSSProperties } from "react";
import { useState } from "react";
import { Alert, Button, Card, Tooltip, Spin } from "antd";
import { zIndexTip } from "./zindex";
import MoneyStatistic from "./money-statistic";
import { currency } from "@cocalc/util/misc";
import Payment from "./payment";
import Next from "@cocalc/frontend/components/next";

interface Props {
  balance?: number | null;
  style?: CSSProperties;
  refresh?: () => Promise<void>;
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
            onClick={() => setAdd(true)}
            style={{ marginTop: "5px" }}
          >
            Make a Payment
          </Button>
          {showTransferLink && balance > 0 && (
            <div style={{ marginTop: "5px" }}>
              <Next href={"store/vouchers"}>Transfer</Next>
            </div>
          )}
        </div>
      );
    } else {
      body = (
        <>
          <Payment
            balance={balance}
            update={() => {
              refresh?.();
              setAdd(false);
            }}
            cost={cost}
          />
          <Button onClick={() => setAdd(false)} style={{ marginTop: "15px" }}>
            Cancel
          </Button>
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
