import type { CSSProperties } from "react";
import { useState } from "react";
import { Button, Card, Tooltip, Spin } from "antd";
import { zIndexTip } from "./zindex";
import MoneyStatistic from "./money-statistic";
import Payment from "./payment";
import { Icon } from "@cocalc/frontend/components/icon";
import AutoBalance from "./auto-balance";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

interface Props {
  style?: CSSProperties;
  refresh?: Function;
  cost?: number; // optional amount of money we want right now
  defaultAdd?: boolean;
}

export default function Balance({ style, refresh, cost, defaultAdd }: Props) {
  const balance = useTypedRedux("account", "balance");
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
          <div style={{ marginTop: "20px" }}>
            <AutoBalance />
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
        </>
      );
    }
  }
  return <Card style={style}>{body}</Card>;
}
