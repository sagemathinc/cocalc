import { Footer } from "../customize";
import Payments from "./payments";
import AutomaticPayments from "./automatic-payments";

export default function PaymentsPage() {
  return (
    <div>
      <AutomaticPayments />
      <Payments />
      <Footer />
    </div>
  );
}
