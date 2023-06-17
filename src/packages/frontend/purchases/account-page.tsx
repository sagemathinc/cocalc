import Purchases from "./purchases";
import Quotas from "./all-quotas-config";
import CostBarChart from "./cost-bar-chart";

export default function PayAsYouGoAccountPage({}) {
  return (
    <div>
      <Quotas />
      <Purchases />
      <CostBarChart />
    </div>
  );
}
