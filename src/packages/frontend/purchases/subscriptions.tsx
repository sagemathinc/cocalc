/*

The subscriptions look like this in the database:

[
  {
    id: 1,
    account_id: "8e138678-9264-431c-8dc6-5c4f6efe66d8",
    created: "2023-07-03T03:40:51.798Z",
    cost: 5.4288,
    interval: "month",
    current_period_start: "2023-07-02T07:00:00.000Z",
    current_period_end: "2023-08-03T06:59:59.999Z",
    latest_purchase_id: 220,
    status: "active",
    metadata: {
      type: "license",
      license_id: "a3e17422-8f09-48d4-bc34-32f0bdc77f73",
    },
  },
];
*/

import { Alert, Button, Spin, Table } from "antd";
import { useEffect, useState } from "react";
import { getSubscriptions as getSubscriptionsUsingApi } from "./api";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import { currency } from "./util";

const columns = [
  {
    title: "ID",
    dataIndex: "id",
    key: "id",
  },
  {
    title: "Created",
    dataIndex: "created",
    key: "created",
    render: (date) => <TimeAgo date={date} />,
  },
  {
    title: "Cost",
    dataIndex: "cost",
    key: "cost",
    render: (cost) => currency(cost),
  },
  {
    title: "Interval",
    dataIndex: "interval",
    key: "interval",
  },
  {
    title: "Current Period",
    key: "period",
    render: (_, record) => {
      return (
        <>
          <TimeAgo date={record.current_period_start} /> to{" "}
          <TimeAgo date={record.current_period_end} />
        </>
      );
    },
  },
  {
    title: "Latest Purchase Id",
    dataIndex: "latest_purchase_id",
    key: "latest_purchase_id",
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
  },
  {
    title: "Description",
    key: "desc",
    render: (_, { metadata }) => {
      return <>{JSON.stringify(metadata, undefined, 2)}</>;
    },
  },
];

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(
    null
  );
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const getSubscriptions = async () => {
    try {
      setLoading(true);
      setError("");
      // [ ] TODO: pager, which is only needed if one user has more than 100 subscriptions...
      setSubscriptions(await getSubscriptionsUsingApi({ limit: 100 }));
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getSubscriptions();
  }, []);

  return (
    <SettingBox
      title={
        <>
          <Button
            style={{ marginRight: "15px", float: "right" }}
            onClick={() => {
              getSubscriptions();
            }}
          >
            <Icon name="refresh" /> Refresh
          </Button>
        </>
      }
    >
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}
      {loading ? (
        <Spin />
      ) : (
        <Table dataSource={subscriptions ?? undefined} columns={columns} />
      )}
    </SettingBox>
  );
}
