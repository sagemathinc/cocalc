/*
Get subscription by id via the api and displays information about that subscription.

A typical subscription object looks like this, where interval can be either "month" or "year",
status can be either "active", "unpaid", "past_due" or "canceled".

{
  "id": 16,
  "created": "2023-07-20T18:53:55.485Z",
  "cost": 6.4,
  "interval": "month",
  "status": "active",
  "canceled_at": "2023-07-20T19:22:34.329Z",
  "resumed_at": "2023-07-20T19:22:37.734Z",
  "current_period_start": "2023-07-20T18:53:55.491Z",
  "current_period_end": "2023-08-20T18:53:55.491Z",
  "latest_purchase_id": 431,
  "metadata": {
    "type": "membership",
    "class": "member"
  }
}
*/

import { Card, Spin } from "antd";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import { getSubscription } from "./api";
import { CSSProperties, useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { moneyToCurrency } from "@cocalc/util/money";
import { SubscriptionStatus } from "./subscriptions-util";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  subscription_id: number;
  style?: CSSProperties;
}

export default function Subscription({ subscription_id, style }: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setSubscription(await getSubscription(subscription_id));
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card
      style={{ ...style, maxWidth: "600px" }}
      title={
        <div>
          <Icon name="calendar" style={{ marginRight: "8px" }} /> Subscription{" "}
          <div style={{ float: "right" }}>Id: {subscription_id}</div>
        </div>
      }
    >
      {error && <ShowError error={error} setError={setError} />}
      {loading && <Spin />}
      {subscription != null && (
        <div>
          {subscription.interval == "month" ? "Monthly" : "Yearly"} subscription
          that costs {moneyToCurrency(subscription.cost)}/
          {subscription.interval}
          <br />
          Status: <SubscriptionStatus status={subscription.status} />
          <br />
          <div style={{ color: "#666" }}>
            Current Period: <TimeAgo date={subscription.current_period_start} />{" "}
            to <TimeAgo date={subscription.current_period_end} />
            <br />
            Created: <TimeAgo date={subscription.created} />
          </div>
        </div>
      )}
    </Card>
  );
}
