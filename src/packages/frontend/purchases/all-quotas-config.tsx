/*
Configure quota for all services.

This shows an overview of configured quotas for all services,
and lets you adjust any of them.
*/

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Progress,
  Space,
  Spin,
  Table,
} from "antd";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { cloneDeep, isEqual } from "lodash";
import { Icon } from "@cocalc/frontend/components/icon";
import ServiceTag from "./service";
import GlobalQuota from "./global-quota";
import { currency } from "./quota-config";
import Balance from "./balance";
import Cost from "./pay-as-you-go/cost";

interface ServiceQuota {
  service: Service;
  quota: number;
  current: number;
}

export default function AllQuotasConfig({ noStats }: { noStats?: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [globalQuota, setGlobalQuota] = useState<{
    quota: number;
    why: string;
    increase: string;
  } | null>(null);
  const [serviceQuotas, setServiceQuotas] = useState<ServiceQuota[] | null>(
    null
  );
  const lastFetchedQuotasRef = useRef<ServiceQuota[] | null>(null);
  const [changed, setChanged] = useState<boolean>(false);
  const getBalance = async () => {
    try {
      setBalance(null);
      setBalance(await webapp_client.purchases_client.getBalance());
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    getBalance();
  }, []);

  const getQuotas = async () => {
    let x, y;
    try {
      x = await webapp_client.purchases_client.getQuotas();
      y = await webapp_client.purchases_client.getChargesByService();
    } catch (err) {
      setError(`${err}`);
      return;
    }
    const { global, services } = x;
    const v: ServiceQuota[] = [];
    for (const service in QUOTA_SPEC) {
      const spec = QUOTA_SPEC[service];
      if (spec.noSet) continue;
      v.push({
        current: y[service] ?? 0,
        service: service as Service,
        quota: services[service] ?? 0,
      });
    }
    lastFetchedQuotasRef.current = cloneDeep(v);
    setGlobalQuota(global);
    setServiceQuotas(v);
    setChanged(false);
  };

  useEffect(() => {
    getQuotas();
  }, []);

  const handleQuotaChange = (index: number, newQuota: number) => {
    if (serviceQuotas == null) {
      throw Error("serviceQuotas must not be null");
    }
    const updated = [...serviceQuotas];
    updated[index].quota = newQuota;
    setServiceQuotas(updated);
    setChanged(!isEqual(updated, lastFetchedQuotasRef.current));
  };

  const handleSave = async () => {
    if (lastFetchedQuotasRef.current == null || serviceQuotas == null) return;
    try {
      setSaving(true);
      for (let i = 0; i < lastFetchedQuotasRef.current.length; i++) {
        if (!isEqual(lastFetchedQuotasRef.current[i], serviceQuotas[i])) {
          try {
            await webapp_client.purchases_client.setQuota(
              serviceQuotas[i].service,
              serviceQuotas[i].quota
            );
          } catch (err) {
            setError(`${err}`);
          }
        }
      }
      getQuotas();
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setServiceQuotas(cloneDeep(lastFetchedQuotasRef.current));
    setChanged(false);
  };

  const handleRefresh = () => {
    getQuotas();
    getBalance();
  };

  const columns = [
    {
      title: "Service",
      dataIndex: "service",
      render: (service) => <ServiceTag service={service} />,
    },
    {
      title: "Monthly Limit (USD)",
      dataIndex: "quota",
      align: "center" as "center",
      render: (quota: number, _record: ServiceQuota, index: number) => (
        <InputNumber
          min={0}
          value={quota}
          onChange={(newQuota) => handleQuotaChange(index, newQuota as number)}
          formatter={(value) => `$${value}`}
        />
      ),
    },
    {
      title: "Cost",
      align: "center" as "center",
      render: (_, { service }: ServiceQuota) => <Cost service={service} />,
    },
    {
      title: "This Month Spend (USD)",
      dataIndex: "current",
      align: "center" as "center",
      render: (current: number, record: ServiceQuota) => (
        <div>
          {currency(current)}{" "}
          <Progress
            percent={Math.round((current / record.quota) * 100)}
            strokeColor={current / record.quota > 0.8 ? "#ff4d4f" : undefined}
          />
        </div>
      ),
    },
  ];

  return (
    <SettingBox
      icon="dashboard"
      title={<span style={{ marginLeft: "5px" }}>Balance and Limits</span>}
    >
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}
      {!noStats && (
        <div style={{ textAlign: "center" }}>
          <Space>
            <Balance
              balance={balance}
              quota={globalQuota?.quota}
              style={{ width: "300px", height: "250px" }}
            />
            <GlobalQuota
              global={globalQuota}
              style={{
                width: "300px",
                height: "250px",
              }}
            />
            <Card
              title="Balance ≤ Spending Limit"
              style={{ width: "300px", height: "250px", color: "#666" }}
            >
              You balance is not allowed to exceed your total spending limit.
              You can reduce your balance by making a payment, and you can raise
              your spending limit by adding a credit card, verifying your
              email address, or making a support request.
            </Card>
          </Space>
        </div>
      )}
      <Card
        style={{ margin: "15px 0", overflow: "auto" }}
        title={
          <>
            Monthly limits are self-imposed caps you set to prevent overspending
          </>
        }
      >
        <div style={{ marginBottom: "15px" }}>
          <Button.Group style={{ marginRight: "5px" }}>
            <Button onClick={handleCancel} disabled={!changed || saving}>
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              disabled={!changed || saving}
            >
              <Icon name="save" />{" "}
              {saving ? "Saving..." : changed ? "Save Changes" : "Saved"}
              {saving && <Spin style={{ marginLeft: "15px" }} delay={500} />}
            </Button>
          </Button.Group>
          <Button onClick={handleRefresh} disabled={saving}>
            <Icon name="refresh" />
            Refresh
          </Button>
        </div>
        {serviceQuotas != null ? (
          <Table
            dataSource={serviceQuotas}
            columns={columns}
            pagination={false}
            rowKey="service"
          />
        ) : (
          <div style={{ textAlign: "center" }}>
            <Spin size="large" delay={500} />
          </div>
        )}
      </Card>
    </SettingBox>
  );
}
