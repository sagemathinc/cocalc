import Purchases from "./purchases";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import Next from "@cocalc/frontend/components/next";

export default function PayAsYouGoAccountPage({}) {
  return (
    <div>
      <div style={{ marginBottom: "15px" }}>
        <Next href={"billing/receipts"}>Invoices and Receipts...</Next>
      </div>
      <Purchases />
      <Quotas />
      <CostBarChart />
    </div>
  );
}
