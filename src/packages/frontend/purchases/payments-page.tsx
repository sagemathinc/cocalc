import Payments from "./payments";
import PaymentMethods from "./payment-methods";

export default function PaymentsPage() {
  return (
    <div>
      <PaymentMethods />
      <Payments />
    </div>
  );
}
