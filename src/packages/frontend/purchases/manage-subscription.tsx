/*
NEVER USED -- it implements a button to pay a subscription
in advance.  Should probably delete this as it adds complexity.
*/

import {
  Button,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Statistic,
  Tooltip,
} from "antd";
import { useEffect, useState } from "react";
import { getLicense, getSubscription, createSubscriptionPayment } from "./api";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import ShowError from "@cocalc/frontend/components/error";
import type { LicenseFromApi } from "@cocalc/util/db-schema/site-licenses";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, round4 } from "@cocalc/util/misc";
import { describe_quota as describeQuota } from "@cocalc/util/licenses/describe-quota";
import { SubscriptionStatus } from "./subscriptions-util";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import dayjs from "dayjs";

export function ManageSubscriptionButton({ subscription_id, ...props }) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        {props.children ? (
          props.children
        ) : (
          <>
            <Icon name="gears" style={{ marginRight: "5px" }} /> Manage
          </>
        )}
      </Button>
      {open && (
        <ManageSubscriptionModal
          subscription_id={subscription_id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ManageSubscriptionModal({ onClose, subscription_id }) {
  return (
    <Modal
      width="600px"
      open
      title={<>Manage Subscription (Id = {subscription_id})</>}
      onCancel={onClose}
      onOk={onClose}
    >
      <ManageSubscription subscription_id={subscription_id} />
    </Modal>
  );
}

export function ManageSubscription({
  subscription_id,
  style,
}: {
  subscription_id: number;
  style?;
}) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [license, setLicense] = useState<LicenseFromApi | null>(null);

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const reload = async () => {
    if (subscription != null) {
      return;
    }
    try {
      setError("");
      setLoading(true);
      const [newSubscription, newLicense] = await Promise.all([
        getSubscription(subscription_id),
        getLicense({ subscription_id }),
      ]);
      setSubscription(newSubscription);
      setLicense(newLicense);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  //   useEffect(() => {
  //     if (window != null) {
  //       window.x = { license, subscription };
  //     }
  //   }, [license, subscription]);

  return (
    <div style={style}>
      {loading && <Spin style={{ marginLeft: "30px" }} />}
      <ShowError
        style={{ margin: "15px 30px" }}
        error={error}
        setError={setError}
      />
      {subscription && (
        <DescribeSubscription
          license={license}
          subscription={subscription}
          reload={reload}
        />
      )}
    </div>
  );
}

function DescribeSubscription({ license, subscription, reload }) {
  return (
    <div>
      <Space direction="vertical">
        <div>{capitalize(subscription.interval)}ly Subscription</div>
        {subscription.cost != null && (
          <div>
            <Space>
              <Statistic
                title={<>Cost Per {capitalize(subscription.interval)} (USD)</>}
                value={subscription.cost}
                precision={2}
                prefix={"$"}
              />
              <div style={{ width: "30px" }} />
              <Tooltip
                title={`(USD): ${round4(subscription.cost_per_hour)}/hour`}
              >
                <Statistic
                  title={<>Cost Per Hour (USD)</>}
                  value={subscription.cost_per_hour}
                  precision={2}
                  prefix={"$"}
                />
              </Tooltip>
            </Space>
          </div>
        )}
        <PaymentStatus license={license} subscription={subscription} />
        <MakeNextPayment
          license={license}
          subscription={subscription}
          reload={reload}
        />
        <Space>
          <div>
            Status: <SubscriptionStatus status={subscription.status} />
          </div>
          <div>
            Created: <TimeAgo date={subscription.created} />
          </div>
        </Space>
        <div> License: {license.id}</div>
        {license.quota && <div>{describeQuota(license.quota, false)}</div>}
      </Space>
    </div>
  );
}

function PaymentStatus({ license, subscription }) {
  const { payment } = subscription;
  const { expires } = license;

  //let nextPaymentDue;
  if (payment == null) {
    return (
      <div>
        <b>
          Your subscription is fully paid until <TimeAgo date={expires} />.
        </b>
      </div>
    );
  }

  return null;
}

function MakeNextPayment({ license, subscription, reload }) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  if (subscription.payment != null && subscription.payment.status == "active") {
    return <div>Payment in progress...</div>;
  }

  const { expires } = license;
  const nextEnd = dayjs(expires).add(1, subscription.interval).toDate();
  return (
    <div>
      <Popconfirm
        title={
          <>
            Are you sure you want to pay this subscription until{" "}
            <TimeAgo date={nextEnd} />?
          </>
        }
        onConfirm={async () => {
          try {
            setError("");
            setLoading(true);
            await createSubscriptionPayment(subscription.id);
            await reload();
          } catch (err) {
            setError(`${err}`);
          } finally {
            setLoading(false);
          }
        }}
        okText="Yes"
        cancelText="No"
      >
        <Button disabled={loading}>
          Pay Subscription Through <TimeAgo date={nextEnd} placement="bottom" />
          ...
          {loading && <Spin style={{ marginLeft: "30px" }} />}
        </Button>
      </Popconfirm>
      <ShowError
        style={{ margin: "15px 30px" }}
        error={error}
        setError={setError}
      />
    </div>
  );
}
