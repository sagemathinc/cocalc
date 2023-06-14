import Purchases from "./purchases";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";
import { A } from "@cocalc/frontend/components";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default function PayAsYouGoAccountPage({}) {
  return (
    <div>
      <div style={{ marginBottom: "15px" }}>
        <A href={join(appBasePath, "billing/receipts")}>
          Invoices and Receipts...
        </A>
      </div>
      <Purchases />
      <Quotas />
      <CostBarChart />
    </div>
  );
}
