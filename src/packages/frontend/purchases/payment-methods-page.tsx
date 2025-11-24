import { UseBalance } from "@cocalc/frontend/account/other-settings";
import PaymentMethods from "./payment-methods";

export default function PaymentsPage() {
  return (
    <div>
      <PaymentMethods
        balanceComponent={<UseBalance style={{ marginTop: "20px" }} />}
      />
    </div>
  );
}
