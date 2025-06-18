import { Collapse, CollapseProps, Divider } from "antd";
import { useState } from "react";
import Statements from "./statements";
import Statement from "./statement";
import { Icon } from "@cocalc/frontend/components/icon";
import ClosingDate from "./closing-date";

type Key = string[] | string | number[] | number;

const cache: { activeKey: Key } = { activeKey: [] };

export default function StatementsPage() {
  const [activeKey, setActiveKey] = useState<Key>(cache.activeKey);

  const items: CollapseProps["items"] = [
    {
      key: "monthly-statements",
      label: (
        <>
          <Icon name="calendar-check" style={{ marginRight: "8px" }} />
          Monthly Statements
        </>
      ),
      children: <Statements interval="month" />,
    },
    {
      key: "daily-statements",
      label: (
        <>
          <Icon name="calendar-week" style={{ marginRight: "8px" }} />
          Daily Statements
        </>
      ),
      children: <Statements interval="day" />,
    },
  ];

  return (
    <div>
      <ClosingDate />
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
        destroyOnHidden
        activeKey={activeKey}
        onChange={(x) => {
          cache.activeKey = x;
          setActiveKey(x);
        }}
        items={items}
      />
    </div>
  );
}
