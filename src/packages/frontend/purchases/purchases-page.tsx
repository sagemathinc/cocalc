import AllQuotasConfig from "./all-quotas-config";
import Purchases from "./purchases";
import AutomaticPayments from "./automatic-payments";

export default function PurchasesPage() {
  return (
    <div>
      <Purchases noTitle />
      <AutomaticPayments />
      <AllQuotasConfig />
    </div>
  );
}
