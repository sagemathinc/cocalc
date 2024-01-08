/*
Configure quota for all services.

This shows an overview of configured quotas for all services,
and lets you adjust any of them.
*/

import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { QUOTA_SPEC, Service } from "@cocalc/util/db-schema/purchase-quotas";
import { currency } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Alert, Button, InputNumber, Progress, Spin, Table, Tag } from "antd";
import { cloneDeep, isEqual } from "lodash";
import { useEffect, useRef, useState } from "react";
import Cost from "./pay-as-you-go/cost";
import ServiceTag from "./service";
import Refresh from "./refresh";

export const QUOTA_LIMIT_ICON_NAME = "ColumnHeightOutlined";

export const PRESETS = [0, 5, 20, 1000];
export const STEP = 5;

interface ServiceQuota {
  service: Service;
  quota: number;
  current: number;
}

export default function AllQuotasConfig() {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [serviceQuotas, setServiceQuotas] = useState<ServiceQuota[] | null>(
    null,
  );
  const lastFetchedQuotasRef = useRef<ServiceQuota[] | null>(null);
  const [changed, setChanged] = useState<boolean>(false);

  const getQuotas = async () => {
    let x, y;
    try {
      x = await webapp_client.purchases_client.getQuotas();
      y = await webapp_client.purchases_client.getChargesByService();
    } catch (err) {
      setError(`${err}`);
      return;
    }
    const { services } = x;
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
              serviceQuotas[i].quota ??
                lastFetchedQuotasRef.current[i]?.quota ??
                0,
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

  const handleRefresh = () => {
    getQuotas();
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
        <div>
          <div style={{ marginBottom: "15px", whiteSpace: "nowrap" }}>
            {PRESETS.map((amount) => (
              <Preset
                key={amount}
                index={index}
                amount={amount}
                handleQuotaChange={(a, b) => {
                  handleQuotaChange(a, b);
                  handleSave();
                }}
              />
            ))}
          </div>
          <InputNumber
            min={0}
            value={quota}
            onChange={(newQuota) =>
              handleQuotaChange(index, newQuota as number)
            }
            formatter={(value) => `$${value}`}
            step={STEP}
            onBlur={handleSave}
          />
        </div>
      ),
    },
    {
      title: "This Month Spend (USD)",
      dataIndex: "current",
      align: "center" as "center",
      render: (current: number, record: ServiceQuota) => {
        if (record.quota == null) return null;
        return (
          <div>
            {currency(current)}{" "}
            <Progress
              percent={Math.round((current / record.quota) * 100)}
              strokeColor={current / record.quota > 0.8 ? "#ff4d4f" : undefined}
            />
            of {currency(record.quota)}
          </div>
        );
      },
    },
    {
      title: "Cost",
      align: "center" as "center",
      render: (_, { service }: ServiceQuota) => <Cost service={service} />,
    },
  ];

  return (
    <>
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}

      <div style={{ marginLeft: "5px", float: "right" }}>
        <Refresh
          handleRefresh={handleRefresh}
          disabled={saving}
          style={{ float: "right" }}
        />
      </div>

      <div style={{ color: COLORS.GRAY_M, marginBottom: "15px" }}>
        These are your personal monthly spending caps to prevent overspending.
        You can change them to whatever you want at any time.
      </div>

      <div style={{ marginBottom: "15px" }}>
        <Button.Group style={{ marginRight: "5px" }}>
          {/*<Button onClick={handleCancel} disabled={!changed || saving}>
              Cancel
            </Button>*/}
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
      </div>
      {serviceQuotas != null ? (
        <div style={{ overflow: "auto" }}>
          <Table
            dataSource={serviceQuotas}
            columns={columns}
            pagination={false}
            rowKey="service"
          />
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Spin size="large" delay={500} />
        </div>
      )}
    </>
  );
}

export function Preset({ index, amount, handleQuotaChange }) {
  return (
    <Tag
      style={{ cursor: "pointer", marginBottom: "5px" }}
      color="blue"
      onClick={() => handleQuotaChange(index, amount)}
    >
      ${amount}
    </Tag>
  );
}
