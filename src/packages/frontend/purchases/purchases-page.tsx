import { Card, Divider } from "antd";
import { useRef } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import AccountStatus from "./account-status";
import Quotas, { QUOTA_LIMIT_ICON_NAME } from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import Purchases from "./purchases";
import { Footer } from "../customize";

export default function PurchasesPage() {
  const refreshPurchasesRef = useRef<any>(null);

  return (
    <div>
      <AccountStatus
        onRefresh={() => {
          refreshPurchasesRef.current?.();
        }}
      />
      <Purchases noTitle />
      <Divider orientation="left" style={{ marginTop: "30px" }}>
        <Icon name="line-chart" style={{ marginRight: "8px" }} />
        Plots
      </Divider>
      <CostBarChart />
      <Divider orientation="left" style={{ marginTop: "30px" }}>
        <Icon name={QUOTA_LIMIT_ICON_NAME} style={{ marginRight: "8px" }} />{" "}
        Limits
      </Divider>
      <Card>
        <Quotas />
      </Card>
      <Footer />
    </div>
  );
}
