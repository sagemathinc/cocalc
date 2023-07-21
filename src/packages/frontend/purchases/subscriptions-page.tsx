import Subscriptions from "./subscriptions";
import AutomaticPayments from "./automatic-payments";

export default function SubscriptionsPage() {
  return (
    <div>
      <AutomaticPayments style={{ marginBottom: "15px" }} />
      <Subscriptions />
    </div>
  );
}
