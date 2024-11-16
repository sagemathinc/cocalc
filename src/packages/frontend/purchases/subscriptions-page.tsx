import Subscriptions from "./subscriptions";
import Next from "@cocalc/frontend/components/next";

export default function SubscriptionsPage() {
  return (
    <div>
      <Subscriptions />
      <div style={{ margin: "15px 0" }}>
        <Next href="/billing/subscriptions">Legacy Subscriptions Page...</Next>
      </div>
    </div>
  );
}
