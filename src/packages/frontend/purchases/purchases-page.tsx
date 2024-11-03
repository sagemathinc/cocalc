import { Checkbox, Collapse, CollapseProps, Divider, Tooltip } from "antd";
import dayjs from "dayjs";
import { useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import AccountStatus from "./account-status";
import Quotas, { QUOTA_LIMIT_ICON_NAME } from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import Purchases, { PurchasesTable } from "./purchases";
import { Footer } from "../customize";

type Key = string[] | string | number[] | number;

const cache: { activeKey: Key } = { activeKey: [] };

export default function PurchasesPage() {
  const [activeKey, setActiveKey] = useState<Key>(cache.activeKey);
  const [group, setGroup] = useState<boolean>(false);
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const refreshPurchasesRef = useRef<any>(null);

  const items: CollapseProps["items"] = [
    {
      key: "transactions",
      label: (
        <>
          <Icon name="credit-card" style={{ marginRight: "8px" }} /> All
          Transactions
        </>
      ),
      children: <Purchases />,
    },
    {
      key: "limits",
      label: (
        <>
          <Icon name={QUOTA_LIMIT_ICON_NAME} style={{ marginRight: "8px" }} />{" "}
          Spending Limits
        </>
      ),
      children: <Quotas />,
    },
    {
      key: "spend",
      label: (
        <>
          <Icon name="graph" style={{ marginRight: "8px" }} />
          Spending Plots
        </>
      ),
      children: <CostBarChart />,
    },
  ];

  return (
    <div>
      <AccountStatus
        onRefresh={() => {
          refreshPurchasesRef.current?.();
        }}
      />
      <Divider orientation="left" style={{ marginTop: "30px" }}>
        <Tooltip title="These are recent purchases made within CoCalc involving internal CoCalc credit.">
          Transactions During the Last Day
        </Tooltip>
      </Divider>
      <div>
        <Tooltip title="Aggregate transactions by service and project so you can see how much you are spending on each service in each project. Pay-as-you-go in progress purchases are not included.">
          <Checkbox
            checked={group}
            onChange={(e) => setGroup(e.target.checked)}
          >
            Group by service and project
          </Checkbox>
        </Tooltip>
        <Tooltip title="Only show unfinished active purchases">
          <Checkbox
            disabled={group}
            checked={!group && activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          >
            Only Show Active Purchases
          </Checkbox>
        </Tooltip>
      </div>{" "}
      <PurchasesTable
        limit={MAX_API_LIMIT}
        cutoff={dayjs().subtract(1, "day").toDate()}
        showRefresh
        showBalance
        activeOnly={!group && activeOnly}
        group={group}
        refreshRef={refreshPurchasesRef}
      />
      <Divider orientation="left" style={{ marginTop: "30px" }}>
        <Tooltip title="These are all purchases made within CoCalc using internal CoCalc credit.">
          All Transactions, Spending Limits, and Plots
        </Tooltip>
      </Divider>
      <Collapse
        destroyInactivePanel /* so that data is refreshed when they are shown */
        activeKey={activeKey}
        onChange={(x) => {
          cache.activeKey = x;
          setActiveKey(x);
        }}
        items={items}
      />
      <Footer />
    </div>
  );
}
