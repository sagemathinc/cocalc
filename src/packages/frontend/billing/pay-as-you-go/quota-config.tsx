/*
Configure quota for a specific service.  This is something that happens
in a modal on demand when you try to use a specific service and don't
have sufficient quota.
*/

import { useEffect, useState } from "react";
import { Alert, Button, Card, InputNumber, Space } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  serviceToDisplay,
  Service,
} from "@cocalc/util/db-schema/purchase-quotas";
import ServiceTag from "./service";
import { to_money } from "@cocalc/util/misc";
import Quotas from "./all-quotas-config";

export function currency(n) {
  return `$${to_money(n)}`;
}

export default function QuotaConfig({
  service,
  updateAllowed,
}: {
  service: Service;
  updateAllowed: () => Promise<void>;
}) {
  const [showAll, setShowAll] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<number | null>(null);
  const [savedValue, setSavedValue] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [quotas, setQuotas] = useState<{
    global: number;
    services: { [service: string]: number };
  } | null>(null);

  const updateQuotas = async () => {
    setQuotas(await webapp_client.purchases_client.getQuotas());
  };

  useEffect(() => {
    updateQuotas();
    updateAllowed();
  }, []);

  const saveServiceQuota = async (service, value) => {
    try {
      setError("");
      await webapp_client.purchases_client.setQuota(service, value);
      setSavedValue(value);
      await updateAllowed();
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <Card title={<>Configure Your {serviceToDisplay(service)} Limit</>}>
      {quotas?.global && <div>Global Limit: {currency(quotas.global)}</div>}
      {quotas?.services && (
        <Space>
          <ServiceTag service={service} />{" "}
          <InputNumber
            style={{ width: "200px" }}
            min={0}
            max={quotas?.global}
            defaultValue={quotas.services[service] ?? 0}
            formatter={(value) =>
              `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
            }
            parser={(value) => value!.replace(/\$\s?|(,*)/g, "") as any}
            onChange={(value) => setInputValue(value ?? null)}
            addonAfter={
              <Button
                type="text"
                disabled={savedValue == inputValue}
                onClick={() => {
                  if (inputValue != null) {
                    saveServiceQuota(service, inputValue);
                  }
                }}
              >
                Save{savedValue == inputValue ? "d" : ""}
              </Button>
            }
          />
        </Space>
      )}
      {error && <Alert type="error" description={error} />}
      {!showAll && (
        <div style={{ marginTop: "15px", textAlign: "center" }}>
          <Button type="link" onClick={() => setShowAll(true)}>
            (show all limits...)
          </Button>
        </div>
      )}
      {showAll && (
        <div style={{ marginTop: "30px" }}>
          <Quotas />
        </div>
      )}
    </Card>
  );
}
