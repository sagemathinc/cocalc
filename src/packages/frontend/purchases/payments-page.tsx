import { Footer } from "../customize";
import Payments from "./payments";
import PaymentMethods from "./payment-methods";
import AutomaticPayments from "./automatic-payments";
import AccountStatus from "./account-status";

export default function PaymentsPage() {
  return (
    <div>
      <AccountStatus />
      <AutomaticPayments />
      <Payments />
      <PaymentMethods />
      <Footer />
    </div>
  );
}
