import Subscriptions from "./subscriptions";
import Next from "@cocalc/frontend/components/next";
import { UseBalance } from "@cocalc/frontend/account/other-settings";

export default function SubscriptionsPage() {
  return (
    <div>
      <div style={{ margin: "5px 0 15px 30px" }}>
        <UseBalance minimal />
      </div>
      <Subscriptions />
      <div style={{ margin: "15px 0" }}>
        <Next href="/billing/subscriptions">Legacy Subscriptions Page...</Next>
      </div>
    </div>
  );
}
