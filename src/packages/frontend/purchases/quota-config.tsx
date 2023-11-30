/*
Configure quota for a specific service.  This is something that happens
in a modal on demand when you try to use a specific service and don't
have sufficient quota.
*/

import { useEffect, useState } from "react";
import { Alert, Button, Card, InputNumber, Space, Spin } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  serviceToDisplay,
  Service,
} from "@cocalc/util/db-schema/purchase-quotas";
import ServiceTag from "./service";
import Quotas, { PRESETS, Preset, STEP } from "./all-quotas-config";
import Balance from "./balance";
import MinBalance from "./min-balance";
import { QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";

interface Props {
  service: Service;
  updateAllowed: () => Promise<void>;
  cost?: number; // optional amount of money we want right now
  saveRef?;
}

export default function QuotaConfig({
  service,
  updateAllowed,
  cost,
  saveRef,
}: Props) {
  const [showAll, setShowAll] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<number | null>(null);
  const [savedValue, setSavedValue] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [quotas, setQuotas] = useState<{
    minBalance: number;
    services: { [service: string]: number };
  } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const updateQuotas = async () => {
    setBalance(await webapp_client.purchases_client.getBalance());
    setQuotas(await webapp_client.purchases_client.getQuotas());
  };

  useEffect(() => {
    updateQuotas();
    updateAllowed();
  }, []);

  const saveServiceQuota = async () => {
    if (inputValue == null) {
      return;
    }
    try {
      setError("");
      await webapp_client.purchases_client.setQuota(service, inputValue);
      setSavedValue(inputValue);
      await updateAllowed();
    } catch (err) {
      setError(`${err}`);
    }
  };
  if (saveRef != null) {
    saveRef.current = saveServiceQuota;
  }

  return (
    <div>
      {!QUOTA_SPEC[service]?.noSet && (
        <Card
          style={{ textAlign: "center" }}
          title={
            <>
              Set your monthly spending limit for the{" "}
              {serviceToDisplay(service)} service
            </>
          }
        >
          {quotas == null && <Spin delay={500} />}

          {quotas?.services && (
            <Space>
              <ServiceTag service={service} />{" "}
              <InputNumber
                style={{ width: "120px" }}
                min={0}
                step={STEP}
                value={inputValue}
                defaultValue={quotas.services[service] ?? 0}
                formatter={(value) =>
                  `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                }
                parser={(value) => value!.replace(/\$\s?|(,*)/g, "") as any}
                onChange={(value) => setInputValue(value ?? null)}
              />
              <Button
                type="primary"
                disabled={savedValue == inputValue}
                onClick={saveServiceQuota}
              >
                Save{savedValue == inputValue ? "d" : ""}
              </Button>
              <div style={{ marginLeft: "15px" }}>
                {PRESETS.filter((amount) => amount > 0).map((amount) => (
                  <Preset
                    key={amount}
                    index={0}
                    amount={amount}
                    handleQuotaChange={(_, amount) => {
                      setInputValue(amount);
                    }}
                  />
                ))}
              </div>
            </Space>
          )}
          {error && <Alert type="error" description={error} />}
        </Card>
      )}
      <div style={{ marginTop: "15px", textAlign: "center" }}>
        <Balance
          balance={balance}
          style={{ width: "100%", marginBottom: "15px" }}
          cost={
            quotas == null || cost == null || balance == null
              ? undefined
              : getChargeAmount({
                  cost,
                  balance,
                  minBalance: quotas.minBalance,
                  minPayment: 0,
                }).amountDue
          }
          refresh={updateAllowed}
        />
        <MinBalance minBalance={quotas?.minBalance} />
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
      </div>
    </div>
  );
}
