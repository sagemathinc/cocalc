import { useRef } from "react";
import AccountStatus from "./account-status";
import AllQuotasConfig from "./all-quotas-config";
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
      <AllQuotasConfig />
      <Footer />
    </div>
  );
}
