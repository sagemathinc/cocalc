import Subscriptions from "./subscriptions";
import Next from "@cocalc/frontend/components/next";
import { UseBalance } from "@cocalc/frontend/account/other-settings";
import { Button, Flex } from "antd";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import { Icon } from "@cocalc/frontend/components/icon";

export default function SubscriptionsPage() {
  return (
    <div>
      <Flex style={{ width: "100%", margin: "5px 0", alignItems: "center" }}>
        <UseBalance minimal />
        <div style={{ flex: 1 }} />
        <Button
          target="_blank"
          href={join(appBasePath, "store", "site-license")}
        >
          <Icon name="shopping-cart"/> Purchase Subscription
        </Button>
      </Flex>
      <Subscriptions />
      <div style={{ margin: "15px 0" }}>
        <Next href="/billing/subscriptions">Legacy Subscriptions Page...</Next>
      </div>
    </div>
  );
}
