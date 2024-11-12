import AllQuotasConfig from "./all-quotas-config";
import Purchases from "./purchases";

export default function PurchasesPage() {
  return (
    <div>
      <Purchases noTitle />
      <AllQuotasConfig />
    </div>
  );
}
