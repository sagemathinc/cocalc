import { useRef } from "react";
import { Divider } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import AccountStatus from "./account-status";
import AllQuotasConfig from "./all-quotas-config";
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
      <AllQuotasConfig />
      <Footer />
    </div>
  );
}
