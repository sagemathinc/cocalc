import Subscriptions from "./subscriptions";
import Next from "@cocalc/frontend/components/next";
import { UseBalance } from "@cocalc/frontend/account/other-settings";
import { Button, Flex } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import MembershipPurchaseModal from "@cocalc/frontend/account/membership-purchase-modal";

export default function SubscriptionsPage() {
  const [membershipOpen, setMembershipOpen] = useState(false);
  return (
    <div>
      <Flex style={{ width: "100%", margin: "5px 0", alignItems: "center" }}>
        <UseBalance minimal />
        <div style={{ flex: 1 }} />
        <Button type="primary" onClick={() => setMembershipOpen(true)}>
          <Icon name="user" /> Change Membership
        </Button>
      </Flex>
      <MembershipPurchaseModal
        open={membershipOpen}
        onClose={() => setMembershipOpen(false)}
      />
      <Subscriptions />
      <div style={{ margin: "15px 0" }}>
        <Next href="/billing/subscriptions">Legacy Subscriptions Page...</Next>
      </div>
    </div>
  );
}
