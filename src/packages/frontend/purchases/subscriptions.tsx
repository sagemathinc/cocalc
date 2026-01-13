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

import {
  Alert,
  Button,
  Collapse,
  Flex,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { Icon } from "@cocalc/frontend/components/icon";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { labels } from "@cocalc/frontend/i18n";
import { SiteLicensePublicInfo } from "@cocalc/frontend/site-licenses/site-license-public-info-component";
import {
  type Subscription,
  STATUS_TO_COLOR,
} from "@cocalc/util/db-schema/subscriptions";
import { capitalize, currency } from "@cocalc/util/misc";
import { moneyRound2Up } from "@cocalc/util/money";
import {
  cancelSubscription,
  getLicense,
  getSubscriptions as getSubscriptionsUsingApi,
} from "./api";
import Export from "./export";
import Refresh from "./refresh";
import UnpaidSubscriptions from "./unpaid-subscriptions";
import type { License } from "@cocalc/util/db-schema/site-licenses";
import { SubscriptionStatus } from "./subscriptions-util";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { useTypedRedux, redux } from "@cocalc/frontend/app-framework";
import getSupportURL from "@cocalc/frontend/support/url";
import ResumeSubscription from "./resume-subscription";

function SubscriptionActions({
  subscription_id,
  metadata,
  status,
  refresh,
  interval,
}: {
  subscription_id: number;
  metadata: Subscription["metadata"];
  status: Subscription["status"];
  refresh: () => void;
  interval: Subscription["interval"];
}) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [license, setLicense] = useState<License | null>(null);
  const [showResume, setShowResume] = useState<boolean>(false);
  const license_id = metadata?.type == "license" ? metadata.license_id : null;
  const isLicense = metadata?.type == "license";

  const updateLicense = async () => {
    try {
      if (!license_id) return;
      setLicense((await getLicense({ license_id })) as License);
    } catch (err) {
      setError(`${err}`);
    }
  };

  const reasonRef = useRef<string>("");
  const handleCancel = async () => {
    try {
      setLoading(true);
      setError("");
      await cancelSubscription({
        subscription_id,
        reason: `Requested by the user: ${reasonRef.current}`,
      });
      refresh();
    } catch (error) {
      setError(`${error}`);
    } finally {
      setLoading(false);
    }
  };

  const footer = [
    <Button
      key="support"
      type="link"
      style={{ marginRight: "50px" }}
      href={getSupportURL({
        body: `I have a question about Subscription Id=${subscription_id}.\n\n`,
        subject: `Question about Subscription Id=${subscription_id}`,
        type: "question",
        hideExtra: true,
      })}
      target="_blank"
    >
      <Icon name="medkit" /> Support
    </Button>,
    <Button
      disabled={loading}
      key="nothing"
      onClick={() => setModalOpen(false)}
      type="primary"
    >
      No Change
    </Button>,
  ];
  footer.push(
    <Popconfirm
      key="cancelEnd"
      title={"Cancel this subscription at period end?"}
      description={
        <div style={{ maxWidth: "450px" }}>
          {isLicense
            ? "The license will still be valid until the subscription period ends. You can always restart the subscription or edit the license to change the subscription price."
            : "Your subscription will remain active until the current period ends. You can restart the subscription later if needed."}
          <br />
          <Input.TextArea
            rows={4}
            style={{ width: "100%", margin: "15px 0" }}
            onChange={(e) => (reasonRef.current = e.target.value)}
            placeholder={"Tell us why..."}
          />
        </div>
      }
      onConfirm={() => handleCancel()}
      okText="Yes"
      cancelText="No"
    >
      <Button disabled={loading}>Cancel at Period End...</Button>
    </Popconfirm>,
  );

  return (
    <Space direction="vertical">
      {loading && <Spin />}
      {error && !loading && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
          closable
          onClose={() => setError("")}
        />
      )}
      {status !== "canceled" && (
        <Button
          disabled={loading}
          type="default"
          onClick={() => {
            if (isLicense) {
              updateLicense();
            }
            setModalOpen(true);
          }}
        >
          Cancel...
        </Button>
      )}
      {status !== "canceled" && modalOpen && (
        <Modal
          title="Cancel Subscription"
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={footer}
        >
          <div style={{ maxWidth: "450px" }}>
            Are you sure you want to cancel this subscription? The corresponding
            {isLicense ? " license " : " membership "} will not be renewed.
            <ul style={{ margin: "15px 0" }}>
              {isLicense && (
                <li>
                  Instead of cancelling, <b>you can edit your license</b>, which
                  will change the subscription price. Click the license code to
                  the left, then click "Edit License".
                </li>
              )}
              <li>
                Select "Cancel at Period End" to cancel your subscription. You
                have already paid for your subscription, so it will continue to
                the end of the current period.
              </li>
              <li>You can resume a canceled subscription later.</li>
            </ul>
            {license?.info?.purchased.type == "disk" && (
              <Alert
                showIcon
                type="warning"
                message="Dedicated Disk"
                description="This is a dedicated disk, so when the license ends, all data on the disk will be permanently deleted."
              />
            )}
            {loading && (
              <div style={{ textAlign: "center" }}>
                <Spin />
              </div>
            )}
          </div>
        </Modal>
      )}
      {status == "canceled" && (
        <>
          <Button
            disabled={loading}
            type="default"
            onClick={() => setShowResume(!showResume)}
          >
            Resume...
          </Button>
          <ResumeSubscription
            subscription_id={subscription_id}
            interval={interval}
            open={showResume}
            status={status}
            setOpen={(open) => {
              setShowResume(open);
              if (!open) {
                refresh();
              }
            }}
          />
        </>
      )}
    </Space>
  );
}

function SubscriptionDescription({
  metadata,
  refresh,
}: {
  metadata: Subscription["metadata"];
  refresh: () => void;
}) {
  if (metadata?.type == "membership") {
    return (
      <div>
        Membership: <b>{metadata.class}</b>
      </div>
    );
  }
  if (metadata?.type != "license" || !metadata.license_id) {
    return null;
  }
  return (
    <Collapse
      items={[
        {
          key: "license",
          label: (
            <Flex>
              <Icon name="key" style={{ marginRight: "15px" }} /> License Id:{" "}
              {metadata.license_id}
              <div style={{ flex: 1 }} />
              <div>(expand to edit)</div>
            </Flex>
          ),
          children: (
            <SiteLicensePublicInfo
              license_id={metadata.license_id}
              refresh={refresh}
            />
          ),
        },
      ]}
    />
  );
}

export default function Subscriptions() {
  const intl = useIntl();

  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(
    null,
  );
  const [current, setCurrent] = useState<Subscription | undefined>(undefined);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [counter, setCounter] = useState<number>(0);
  const fragment = useTypedRedux("account", "fragment");

  useEffect(() => {
    if (subscriptions == null || fragment == null) {
      return;
    }
    const id = parseInt(fragment.get("id") ?? "-1");
    if (id == -1) {
      return;
    }
    for (const subscription of subscriptions) {
      if (subscription.id == id) {
        setCurrent(subscription);
        return;
      }
    }
  }, [fragment]);

  const getSubscriptions = async () => {
    try {
      setLoading(true);
      setError("");
      // [ ] TODO: pager, which is only needed if one user has more than 100 subscriptions...
      const subs = await getSubscriptionsUsingApi({ limit: 100 });
      // sorting like this is nice, but it is very confusing when you change state of the
      // subscription and then the one you just paid moves.
      /*
      subs.sort((a, b) => {
        if (a.status == "unpaid" || a.status == "past_due") {
          return -1;
        }
        if (b.status == "unpaid" || b.status == "past_due") {
          return +1;
        }
        if (a.status == "canceled") {
          return 1;
        }
        if (b.status == "canceled") {
          return -1;
        }
        return -cmp(a.id, b.id);
      });
      */
      if (subscriptions == null) {
        // first time
        const f =
          redux.getStore("account").get("fragment")?.toJS() ?? Fragment.get();
        if (f?.id != null) {
          const id = parseInt(f.id);
          let found = false;
          for (const subscription of subs) {
            if (subscription.id == id) {
              setCurrent(subscription);
              found = true;
              break;
            }
          }
          if (!found) {
            Fragment.clear();
          }
        }
      }
      setSubscriptions(subs);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
      setCounter(counter + 1);
    }
  };

  useEffect(() => {
    getSubscriptions();
  }, []);

  const columns = useMemo(
    () => [
      {
        render: (_, subscription) => {
          return (
            <Button onClick={() => setCurrent(subscription)}>
              <Icon name="expand" />
            </Button>
          );
        },
      },
      {
        title: "Id",
        dataIndex: "id",
        key: "id",
      },
      {
        width: "40%",
        title: "Description",
        key: "desc",
        render: (_, subscription) => {
          const { metadata } = subscription;
          if (metadata.type == "license" && metadata.license_id) {
            return (
              <Button onClick={() => setCurrent(subscription)}>
                <Icon name="key" style={{ marginRight: "15px" }} />
                License Id: {metadata.license_id}
              </Button>
            );
          }
          if (metadata.type == "membership") {
            return (
              <Button onClick={() => setCurrent(subscription)}>
                <Icon name="user" style={{ marginRight: "15px" }} />
                Membership: {metadata.class}
              </Button>
            );
          }
          return <>{JSON.stringify(metadata, undefined, 2)}</>;
        },
      },
      {
        title: "Period",
        dataIndex: "interval",
        key: "interval",
        render: (interval) => {
          if (interval == "month") {
            return "Monthly";
          } else if (interval == "year") {
            return "Yearly";
          } else {
            return interval;
          }
        },
      },
      {
        title: "Cost",
        dataIndex: "cost",
        key: "cost",
        render: (cost, record) => {
          // in prod we hit a case where cost was null, hence the if here.
          if (cost != null) {
            return `${currency(moneyRound2Up(cost).toNumber())}/${record.interval}`;
          } else {
            return "-";
          }
        },
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (status) => <SubscriptionStatus status={status} />,
      },
      {
        title: "Manage",
        key: "manage",
        render: (_, { id, metadata, status, interval }) => (
          <>
            <SubscriptionActions
              subscription_id={id}
              metadata={metadata}
              status={status}
              refresh={getSubscriptions}
              interval={interval}
            />
          </>
        ),
      },
      {
        width: "15%",
        title: "Paid Through",
        key: "period",
        render: (_, subscription) => {
          return (
            <>
              <TimeAgo date={subscription.current_period_end} />
            </>
          );
        },
      },
      {
        width: "10%",
        title: "Payment Status",
        key: "status",
        render: (_, subscription) => (
          <PaymentStatus subscription={subscription} />
        ),
      },
      {
        title: "Last Transaction Id",
        dataIndex: "latest_purchase_id",
        key: "latest_purchase_id",
      },

      {
        title: "Created",
        dataIndex: "created",
        key: "created",
        render: (date) => <TimeAgo date={date} />,
      },
    ],
    [],
  );

  return (
    <SettingBox
      title={
        <Flex style={{ width: "100%" }}>
          <Icon name="calendar" style={{ marginRight: "15px" }} />{" "}
          {intl.formatMessage(labels.subscriptions)}
          <div style={{ flex: 1 }} />
          <Refresh
            handleRefresh={getSubscriptions}
            style={{ marginLeft: "30px" }}
          />
          <div style={{ marginLeft: "15px", float: "right", display: "flex" }}>
            <Export
              data={subscriptions}
              name="subscriptions"
              style={{ marginLeft: "8px" }}
            />
          </div>
        </Flex>
      }
    >
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}
      {loading && <Spin />}
      <div style={{ overflow: "auto", width: "100%" }}>
        <UnpaidSubscriptions
          size="large"
          style={{ margin: "15px 0", textAlign: "center" }}
          showWhen="unpaid"
          counter={counter}
          refresh={getSubscriptions}
        />
        <Table
          rowKey={"id"}
          pagination={{ hideOnSinglePage: true, defaultPageSize: 25 }}
          dataSource={subscriptions ?? undefined}
          columns={columns}
        />
        {current != null && (
          <SubscriptionModal
            subscription={current}
            getSubscriptions={getSubscriptions}
            onClose={() => {
              setCurrent(undefined);
              Fragment.clear();
              redux.getActions("account").setFragment(undefined);
            }}
          />
        )}
      </div>
    </SettingBox>
  );
}

function PaymentStatus({ subscription }) {
  const status = subscription.payment?.status;
  if (!status) {
    return null;
  }
  const tag = <Tag color={STATUS_TO_COLOR[status]}>{capitalize(status)}</Tag>;
  return tag;
}

function SubscriptionModal({ subscription, getSubscriptions, onClose }) {
  useEffect(() => {
    Fragment.set({ id: subscription.id });
  }, [subscription.id]);
  return (
    <Modal
      width={800}
      open
      title={<>Subscription Id={subscription.id}</>}
      onOk={onClose}
      onCancel={onClose}
    >
      <Space style={{ width: "100%" }} direction="vertical">
        <SubscriptionDescription
          metadata={subscription.metadata}
          refresh={getSubscriptions}
        />
        <div>
          Status: <SubscriptionStatus status={subscription.status} />
        </div>
        <div>Period: {`${capitalize(subscription.interval)}ly`}</div>
        <div>
          Cost: {currency(moneyRound2Up(subscription.cost).toNumber())} /{" "}
          {subscription.interval}
        </div>
        <div>
          Paid Through: <TimeAgo date={subscription.current_period_end} />
        </div>
        <div>
          Payment Status: <PaymentStatus subscription={subscription} />
        </div>
        <div>Last Transaction Id: {subscription.latest_purchase_id}</div>
        <div>
          Manage:{" "}
          <SubscriptionActions
            subscription_id={subscription.id}
            metadata={subscription.metadata}
            status={subscription.status}
            refresh={() => {
              onClose();
              getSubscriptions();
            }}
            interval={subscription.interval}
          />
        </div>
      </Space>
    </Modal>
  );
}
