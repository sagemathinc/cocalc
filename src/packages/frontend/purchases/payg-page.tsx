import AllQuotasConfig from "./all-quotas-config";
import AutomaticPayments from "./automatic-payments";

export default function PurchasesPage() {
  return (
    <div>
      <AutomaticPayments />
      <AllQuotasConfig />
    </div>
  );
}
