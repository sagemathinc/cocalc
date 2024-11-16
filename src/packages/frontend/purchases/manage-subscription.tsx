import { Button, Modal, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import { getLicense, getSubscription } from "./api";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import ShowError from "@cocalc/frontend/components/error";
import type { LicenseFromApi } from "@cocalc/util/db-schema/site-licenses";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, currency } from "@cocalc/util/misc";
import { describe_quota as describeQuota } from "@cocalc/util/licenses/describe-quota";

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
      title={<>Manage Subscription</>}
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
  useEffect(() => {
    if (subscription != null) {
      return;
    }
    (async () => {
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
    })();
  }, []);
  console.log({ license, subscription });

  return (
    <div style={style}>
      {loading && <Spin style={{ marginLeft: "30px" }} />}
      <ShowError
        style={{ margin: "15px 30px" }}
        error={error}
        setError={setError}
      />
      {subscription && (
        <DescribeSubscription license={license} subscription={subscription} />
      )}
    </div>
  );
}

function DescribeSubscription({ license, subscription }) {
  return (
    <div>
      <Space direction="vertical">
        <div>
          {capitalize(subscription.interval)}ly Subscription that costs{" "}
          {currency(subscription.cost)}/{subscription.interval}
        </div>
        <div> License: {license.id}</div>
        {license.quota && <div>{describeQuota(license.quota, false)}</div>}
      </Space>
    </div>
  );
}
