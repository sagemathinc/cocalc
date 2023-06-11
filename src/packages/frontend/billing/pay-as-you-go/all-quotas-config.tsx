/*
Configure quota for all services.

This shows an overview of configured quotas for all services,
and lets you adjust any of them.
*/

import { useEffect, useRef, useState } from "react";
import { Alert, Button, InputNumber, Spin, Table, Tooltip } from "antd";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { currency } from "./quota-config";
import { cloneDeep, isEqual } from "lodash";
import { Icon } from "@cocalc/frontend/components/icon";

interface ServiceQuota {
  service: Service;
  display: string;
  quota: number;
}

export default function AllQuotasConfig({}) {
  const [error, setError] = useState<string>("");
  const [globalQuota, setGlobalQuota] = useState<number | null>(null);
  const [serviceQuotas, setServiceQuotas] = useState<ServiceQuota[] | null>(
    null
  );
  const lastFetchedQuotasRef = useRef<ServiceQuota[] | null>(null);
  const [changed, setChanged] = useState<boolean>(false);

  const getQuotas = async () => {
    let x;
    try {
      x = await webapp_client.purchases_client.getQuotas();
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
        display: spec.display,
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

  if (serviceQuotas == null) {
    return <Spin size="large" />;
  }

  const handleQuotaChange = (index: number, newQuota: number) => {
    const updated = [...serviceQuotas];
    updated[index].quota = newQuota;
    setServiceQuotas(updated);
    setChanged(!isEqual(updated, lastFetchedQuotasRef.current));
  };

  const handleSave = async () => {
    if (lastFetchedQuotasRef.current == null || serviceQuotas == null) return;
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
  };

  const handleCancel = () => {
    setServiceQuotas(cloneDeep(lastFetchedQuotasRef.current));
    setChanged(false);
  };

  const columns = [
    {
      title: "Service Name",
      dataIndex: "display",
    },
    {
      title: "Limit (USD)",
      dataIndex: "quota",
      render: (quota: number, _record: ServiceQuota, index: number) => (
        <InputNumber
          min={0}
          max={globalQuota ?? 999999999}
          value={quota}
          onChange={(newQuota) => handleQuotaChange(index, newQuota as number)}
          formatter={(value) => `$${value}`}
        />
      ),
    },
  ];

  return (
    <SettingBox
      icon="dashboard"
      title={<span style={{ marginLeft: "5px" }}>Pay as you go limits</span>}
    >
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}
      {globalQuota != null && (
        <Tooltip title="No service limit can exceed this. You can't spend more than this per billing period without making an extra payment.  Contact support to increase your global limit.">
          <div
            style={{ fontSize: "12pt", float: "right", marginBottom: "15px" }}
          >
            Global Limit: {currency(globalQuota)}
          </div>
        </Tooltip>
      )}
      <Button.Group>
        <Button type="primary" onClick={handleSave} disabled={!changed}>
          <Icon name="save" /> {changed ? "Save Changes" : "Saved"}
        </Button>
        <Button onClick={handleCancel} disabled={!changed}>
          Cancel
        </Button>
      </Button.Group>
      {serviceQuotas != null && (
        <Table
          dataSource={serviceQuotas}
          columns={columns}
          pagination={false}
        />
      )}
    </SettingBox>
  );
}
