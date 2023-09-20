import { useState, useEffect } from "react";
import { Alert, Statistic } from "antd";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { getPricePerHour } from "@cocalc/util/purchases/project-quotas";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  quota: ProjectQuota;
}

export default function CostPerHour({ quota }: Props) {
  const [price_per_month, setPrice] = useState<any>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setPrice(
          await webapp_client.purchases_client.getPayAsYouGoPricesProjectQuotas()
        );
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, []);

  if (error) {
    return <Alert type="error" message={error} />;
  }

  if (quota == null || price_per_month == null) {
    return null;
  }

  const value = getPricePerHour(quota, price_per_month);

  return (
    <Statistic
      title={"Cost per hour (USD)"}
      valueStyle={quota.enabled ? undefined : { color: "#888" }}
      value={value}
      precision={3}
      prefix={"$"}
    />
  );
}
