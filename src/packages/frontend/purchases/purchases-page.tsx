import { Collapse } from "antd";
import { useState } from "react";
import Purchases from "./purchases";
import AccountStatus from "./account-status";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import Statements from "./statements";
import { Icon } from "@cocalc/frontend/components/icon";

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
          key="monthly-statements"
          header=<>
            <Icon name="calendar-check" style={{ marginRight: "8px" }} />
            Monthly Statements
          </>
        >
          <Statements interval="month" />
        </Collapse.Panel>
        <Collapse.Panel
          key="daily-statements"
          header=<>
            <Icon name="calendar-week" style={{ marginRight: "8px" }} />
            Daily Statements
          </>
        >
          <Statements interval="day" />
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
