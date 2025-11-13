import { Tag } from "antd";
import { capitalize } from "@cocalc/util/misc";
import { STATUS_TO_COLOR } from "@cocalc/util/db-schema/subscriptions";

export function SubscriptionStatus({ status }) {
  return (
    <Tag color={STATUS_TO_COLOR[status]}>
      {capitalize(status.replace("_", " "))}
    </Tag>
  );
}
