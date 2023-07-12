import { Collapse } from "antd";
import { useState } from "react";
import Purchases from "./purchases";
import AccountStatus from "./account-status";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";

type Key = string[] | string | number[] | number;

const cache: { activeKey: Key } = { activeKey: [] };

export default function PurchasesPage() {
  const [activeKey, setActiveKey] = useState<Key>(cache.activeKey);
  return (
    <div>
      <AccountStatus />
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
          header="Transactions: Every Purchase and Credit"
        >
          <Purchases />
        </Collapse.Panel>
        <Collapse.Panel key="limits" header="Self-Imposed Spending Limits">
          <Quotas />
        </Collapse.Panel>
        <Collapse.Panel key="spend" header="Spending Plots">
          <CostBarChart />
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
