import { Alert, Button, Popconfirm, Spin, Tag } from "antd";
import { CSSProperties, useEffect, useMemo, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency, plural } from "@cocalc/util/misc";
import {
  getLiveSubscriptions,
  LiveSubscription,
  renewSubscription,
} from "./api";

interface Props {
  style?: CSSProperties;
  showWhen: "paid" | "unpaid" | "both";
  counter?: number; // option -- change to force update
  refresh?: () => void; // called after renewal/payment attempt
  size?;
}

export default function UnpaidSubscriptions({
  style,
  showWhen,
  counter,
  refresh,
  size,
}: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [unpaidSubscriptions, setUnpaidSubscriptions] = useState<
    LiveSubscription[] | null
  >(null);
  const [numActive, setNumActive] = useState<number | null>(null);

  const update = async () => {
    try {
      setLoading(true);
      const subs = await getLiveSubscriptions();
      setUnpaidSubscriptions(subs.filter((x) => x.status != "active"));
      setNumActive(subs.filter((x) => x.status == "active").length);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    update();
  }, [counter]);

  const cost = useMemo(() => {
    if (unpaidSubscriptions == null || unpaidSubscriptions.length == 0)
      return 0;
    let total = 0;
    for (const { cost } of unpaidSubscriptions) {
      total += cost;
    }
    return total;
  }, [unpaidSubscriptions]);

  const handleRenewSubscriptions = async () => {
    if (
      cost == 0 ||
      unpaidSubscriptions == null ||
      unpaidSubscriptions.length == 0
    ) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      for (const { id } of unpaidSubscriptions) {
        try {
          await renewSubscription(id);
        } catch (_) {
          await webapp_client.purchases_client.quotaModal({
            service: "edit-license",
            cost,
          });
          await renewSubscription(id);
        }
      }
    } catch (error) {
      setError(`${error}`);
    } finally {
      update();
      refresh?.();
    }
  };

  if (unpaidSubscriptions == null || numActive == null || numActive == 0) {
    return null;
  }

  if (!cost && !error) {
    if (showWhen == "unpaid") {
      return null;
    }
    return (
      <div style={style}>
        <Tag color="green">
          <Icon name="check" /> {numActive} Active{" "}
          {plural(numActive, "Subscription")}
        </Tag>
      </div>
    );
  }

  if (showWhen == "paid") {
    return null;
  }

  return (
    <div style={style}>
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
      <Popconfirm
        title={
          <>
            Are you sure you want to pay for your{" "}
            {plural(unpaidSubscriptions?.length, "subscription")}?
          </>
        }
        description={
          <div style={{ maxWidth: "450px" }}>
            The corresponding {plural(unpaidSubscriptions?.length, "license")}{" "}
            will be renewed and your balance will be reduced by {currency(cost)}
            . You can also cancel or edit any subscriptions in order to change
            the amount due.
          </div>
        }
        onConfirm={handleRenewSubscriptions}
        okText="Renew Subscriptions"
        cancelText={<CancelText />}
      >
        <Button type="primary" size={size} onClick={update}>
          <Icon name="credit-card" />
          Payment of {currency(cost)} is due to renew{" "}
          {unpaidSubscriptions?.length}{" "}
          {plural(unpaidSubscriptions?.length, "subscription")}...
        </Button>
      </Popconfirm>
    </div>
  );
}
