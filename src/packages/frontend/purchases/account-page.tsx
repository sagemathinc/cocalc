import { Collapse } from "antd";
import Purchases from "./purchases";
import AccountStatus from "./account-status";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import { useState } from "react";

type Key = string[] | string | number[] | number;

const cache: { activeKey: Key } = { activeKey: [] };

export default function PurchasesPage() {
  const [activeKey, setActiveKey] = useState<Key>(cache.activeKey);
  return (
    <div>
      <AccountStatus />
      <Collapse
        activeKey={activeKey}
        onChange={(x) => {
          cache.activeKey = x;
          setActiveKey(x);
        }}
      >
        <Collapse.Panel key="transactions" header="Transactions">
          <Purchases />
        </Collapse.Panel>
        <Collapse.Panel key="limits" header="Limits">
          <Quotas />
        </Collapse.Panel>
        <Collapse.Panel key="spend" header="Spend">
          <CostBarChart />
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
