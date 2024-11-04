import { Footer } from "../customize";
import Payments from "./payments";
import PaymentMethods from "./payment-methods";
import AutomaticPayments from "./automatic-payments";

export default function PaymentsPage() {
  return (
    <div>
      <AutomaticPayments />
      <Payments />
      <PaymentMethods />
      <Footer />
    </div>
  );
}
