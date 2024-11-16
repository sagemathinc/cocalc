import { Button, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { getLicense, getSubscription } from "./api";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import ShowError from "@cocalc/frontend/components/error";
import type { LicenseFromApi } from "@cocalc/util/db-schema/site-licenses";

export function ManageSubscriptionButton({ subscription_id, ...props }) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        {props.children ? props.children : "Manage"}
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
      open
      title={<>Manage Subscription</>}
      onCancel={onClose}
      onOk={onClose}
    >
      <ManageSubscription subscription_id={subscription_id} />
    </Modal>
  );
}

function ManageSubscription({ subscription_id }) {
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
        setSubscription(await getSubscription(subscription_id));
        setLicense(await getLicense({ subscription_id }));
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      {loading && <Spin style={{ marginLeft: "30px" }} />}
      <ShowError
        style={{ margin: "15px 0" }}
        error={error}
        setError={setError}
      />
      {subscription_id}
      {subscription && <pre>{JSON.stringify(subscription, undefined, 2)}</pre>}
      {license && <pre>{JSON.stringify(license, undefined, 2)}</pre>}
    </>
  );
}
