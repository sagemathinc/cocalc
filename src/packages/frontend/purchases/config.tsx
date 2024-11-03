import StripeMeteredSubscription from "./stripe-metered-subscription";
import ClosingDate from "./closing-date";
import { CSSProperties } from "react";
import Next from "@cocalc/frontend/components/next";
import { Icon } from "@cocalc/frontend/components";
import { Button } from "antd";

interface Props {
  style?: CSSProperties;
}

const SPACE = "10px";

export default function Config({ style }: Props) {
  return (
    <div style={{ display: "flex", ...style }}>
      <StripeMeteredSubscription />
      <div style={{ width: SPACE, height: SPACE }} />
      <ClosingDate />
      <div style={{ width: SPACE, height: SPACE }} />

      <Next
        href={"store/site-license"}
        query={{
          period: "monthly",
          run_limit: 1,
          member: true,
          uptime: "short",
          cpu: 1,
          ram: 2,
          disk: 3,
        }}
      >
        <Button>
          <Icon name="shopping-cart" /> Buy Subscription
        </Button>
      </Next>
    </div>
  );
}
