import Purchases from "./purchases";
import AccountStatus from "./account-status";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";

export default function PayAsYouGoAccountPage({}) {
  return (
    <div>
      <AccountStatus />
      <Purchases />
      <Quotas />
      <CostBarChart />
    </div>
  );
}
