import { Collapse, Divider } from "antd";
import { useState } from "react";
import Statements from "./statements";
import Statement from "./statement";
import { Icon } from "@cocalc/frontend/components/icon";
import AutomaticPayments from "./automatic-payments";

type Key = string[] | string | number[] | number;

const cache: { activeKey: Key } = { activeKey: [] };

export default function StatementsPage() {
  const [activeKey, setActiveKey] = useState<Key>(cache.activeKey);
  return (
    <div>
      <AutomaticPayments />
      <h3>
        <Icon name="calendar" style={{ marginRight: "8px" }} /> Monthly and
        Daily Statements
      </h3>
      <div style={{ color: "#666", maxWidth: "800px", margin: "auto" }}>
        You can make purchases and add credit to your account. Once per month
        all transactions from the previous month are included in a statement.
        Also, each day the transaction from the previous day are combined into a
        statement. You can browse your statements below.
      </div>
      <Divider>Most Recent Monthly Statement</Divider>
      <Statement />
      <Divider>Monthly and Daily Statements</Divider>
      <Collapse
        destroyInactivePanel
        activeKey={activeKey}
        onChange={(x) => {
          cache.activeKey = x;
          setActiveKey(x);
        }}
      >
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
      </Collapse>
    </div>
  );
}
