import Subscriptions from "./subscriptions";
import Config from "./config";

export default function SubscriptionsPage() {
  return (
    <div>
      <Config style={{ marginBottom: "15px" }} />
      <Subscriptions />
    </div>
  );
}
