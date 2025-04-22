/*
Configure quota for all services.

This shows an overview of configured quotas for all services,
and lets you adjust any of them.
*/

import {
  Alert,
  Button,
  Dropdown,
  InputNumber,
  Progress,
  Spin,
  Table,
  Tag,
} from "antd";
import { cloneDeep, isEqual } from "lodash";
import { useEffect, useRef, useState } from "react";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { getServiceCosts } from "@cocalc/frontend/purchases/api";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { LLM_COST, service2model_core } from "@cocalc/util/db-schema/llm-utils";
import {
  DEFAULT_LLM_QUOTA,
  QUOTA_SPEC,
  Service,
} from "@cocalc/util/db-schema/purchase-quotas";
import { currency } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import Cost from "./pay-as-you-go/cost";
import ServiceTag from "./service";
import { SectionDivider } from "./util";

export const QUOTA_LIMIT_ICON_NAME = "ColumnHeightOutlined";

export const PRESETS = [0, 25, 100, 2000];
export const PRESETS_LLM = [0, 5, 10, 20];
export const STEP = 5;

interface ServiceQuota {
  service: Service;
  quota: number;
  current: number;
  cost?: any;
}

export default function AllQuotasConfig() {
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [serviceQuotas, setServiceQuotas] = useState<ServiceQuota[] | null>(
    null,
  );
  const lastFetchedQuotasRef = useRef<ServiceQuota[] | null>(null);
  const [changed, setChanged] = useState<boolean>(false);
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");

  const getQuotas = async () => {
    let quotas, charges;
    try {
      setLoading(true);
      [quotas, charges] = await Promise.all([
        webapp_client.purchases_client.getQuotas(),
        webapp_client.purchases_client.getChargesByService(),
      ]);
    } catch (err) {
      setError(`${err}`);
      return;
    } finally {
      setLoading(false);
    }
    const { services } = quotas;
    const w: { [service: string]: ServiceQuota } = {};
    for (const service in QUOTA_SPEC) {
      const spec = QUOTA_SPEC[service];
      if (spec.noSet) continue;
      const llmModel = service2model_core(service);
      const isLLM = llmModel != null;
      if (isLLM) {
        // We do not show those models, which can't be selected by users OR are free in the first place
        const cost = LLM_COST[llmModel];
        if (!selectableLLMs.includes(llmModel) || cost?.free === true) {
          continue;
        }
      }
      const defaultQuota = isLLM ? DEFAULT_LLM_QUOTA : 0;
      w[service] = {
        current: charges[service] ?? 0,
        service: service as Service,
        quota: services[service] ?? defaultQuota,
      };
    }
    try {
      const costs = await getServiceCosts(Object.keys(w) as Service[]);
      const v: ServiceQuota[] = [];
      for (const service in costs) {
        v.push({ ...w[service], cost: costs[service] });
      }
      lastFetchedQuotasRef.current = cloneDeep(v);
      setServiceQuotas(v);
      setChanged(false);
    } finally {
      setLoading(false);
    }
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
      render: (quota: number, _record: ServiceQuota, index: number) => {
        const isLLM = QUOTA_SPEC[_record.service]?.category === "ai";
        const presets = isLLM ? PRESETS_LLM : PRESETS;

        return (
          <Dropdown
            menu={{
              items: presets.map((preset) => ({
                key: preset.toString(),
                label: `$${preset}`,
                onClick: () => {
                  handleQuotaChange(index, preset);
                  handleSave();
                },
              })),
            }}
            trigger={["click"]}
            overlayStyle={{ minWidth: "100px" }}
          >
            <div style={{ display: "flex" }}>
              <InputNumber
                min={0}
                value={quota}
                onChange={(newQuota) =>
                  handleQuotaChange(index, newQuota as number)
                }
                formatter={(value) => `$${value}`}
                step={STEP}
                onBlur={handleSave}
                style={{
                  borderRight: "none",
                  borderRadius: "5px 0 0 5px",
                  width: "120px",
                }}
              />
              <Button
                style={{
                  border: "1px solid #d9d9d9",
                  borderLeft: "none",
                  borderRadius: "0 5px 5px 0",
                  padding: "0 8px",
                  cursor: "pointer",
                }}
              >
                <Icon name="caret-down" />
              </Button>
            </div>
          </Dropdown>
        );
      },
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
      render: (_, { cost, service }: ServiceQuota) => (
        <Cost service={service} cost={cost} />
      ),
    },
  ];

  return (
    <div>
      <SectionDivider onRefresh={handleRefresh} loading={saving || loading}>
        Your Pay As You Go Budget
      </SectionDivider>
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}

      <div style={{ color: COLORS.GRAY_M, marginBottom: "15px" }}>
        <Alert
          style={{ margin: "auto", maxWidth: "800px" }}
          type="info"
          description={
            <>
              These are your monthly spending limits to help prevent
              overspending. You can change them at any time, and they help you
              visualize how much you have spent on pay as you go purchases.
              These are "soft limits" --{" "}
              <b>purchases are not blocked if you exceed these limits</b>;
              instead, you will receive warnings.
            </>
          }
        />
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
    </div>
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
