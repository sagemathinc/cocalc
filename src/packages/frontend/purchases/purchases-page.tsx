import { Collapse, Divider } from "antd";
import { useState } from "react";
import Purchases, { PurchasesTable } from "./purchases";
import AccountStatus from "./account-status";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import { Icon } from "@cocalc/frontend/components/icon";
import dayjs from "dayjs";
import { MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import AutomaticPayments from "./automatic-payments";

type Key = string[] | string | number[] | number;

const cache: { activeKey: Key } = { activeKey: [] };

export default function PurchasesPage() {
  const [activeKey, setActiveKey] = useState<Key>(cache.activeKey);
  return (
    <div>
      <AutomaticPayments />
      <Divider>Account Balance</Divider>
      <AccountStatus />
      <Divider style={{ marginTop: "30px" }}>
        Transactions During the Last Day
      </Divider>
      <PurchasesTable
        limit={MAX_API_LIMIT}
        cutoff={dayjs().subtract(1, "day").toDate()}
        showRefresh
      />
      <Divider style={{ marginTop: "30px" }}>
        All Transactions, Spending Limits, and Plots
      </Divider>
      <Collapse
        destroyInactivePanel /* so that data is refreshed when they are shown */
        activeKey={activeKey}
        onChange={(x) => {
          cache.activeKey = x;
          setActiveKey(x);
        }}
      >
        <Collapse.Panel
          key="transactions"
          header=<>
            <Icon name="credit-card" style={{ marginRight: "8px" }} />{" "}
            Transactions: Every Purchase and Credit
          </>
        >
          <Purchases />
        </Collapse.Panel>
        <Collapse.Panel
          key="limits"
          header=<>
            <Icon name="ColumnHeightOutlined" style={{ marginRight: "8px" }} />{" "}
            Self-Imposed Spending Limits
          </>
        >
          <Quotas />
        </Collapse.Panel>
        <Collapse.Panel
          key="spend"
          header=<>
            <Icon name="graph" style={{ marginRight: "8px" }} />
            Spending Plots
          </>
        >
          <CostBarChart />
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
