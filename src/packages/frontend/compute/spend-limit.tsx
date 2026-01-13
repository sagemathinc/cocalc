/*
Configuration to limit spending on a particular compute server.
*/

import {
  Button,
  Flex,
  Modal,
  InputNumber,
  Progress,
  Radio,
  Space,
  Spin,
  Switch,
  Tooltip,
} from "antd";
import { useEffect, useState } from "react";
import { useServer } from "./compute-server";
import Inline from "./inline";
import { isEqual } from "lodash";
import { getPurchases } from "@cocalc/frontend/purchases/api";
import { setServerConfiguration } from "./api";
import {
  type SpendLimit as ISpendLimit,
  SPEND_LIMIT_DEFAULTS,
  spendLimitPeriod,
  validatedSpendLimit,
} from "@cocalc/util/db-schema/compute-servers";
import { currency } from "@cocalc/util/misc";
import { toDecimal } from "@cocalc/util/money";
import { AutomaticShutdownCard } from "./automatic-shutdown";

export function SpendLimit({
  id,
  project_id,
  help,
  extra = [],
}: {
  id: number;
  project_id: string;
  help?: boolean;
  extra?: { id: number; project_id: string }[];
}) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [spendLimit, setSpendLimit] = useState<Partial<ISpendLimit>>(
    server?.configuration?.spendLimit ?? SPEND_LIMIT_DEFAULTS,
  );
  useEffect(() => {
    setSpendLimit(server?.configuration?.spendLimit ?? SPEND_LIMIT_DEFAULTS);
  }, [server?.configuration]);

  if (server == null) {
    return <Spin />;
  }

  return (
    <AutomaticShutdownCard
      title="Spending Limit"
      icon="line-chart"
      enabled={spendLimit.enabled}
      setEnabled={(enabled) => setSpendLimit({ ...spendLimit, enabled })}
      saving={saving}
      setSaving={setSaving}
      setError={setError}
      error={error}
      save={async () => {
        await setServerConfiguration({
          id,
          configuration: {
            spendLimit: { ...SPEND_LIMIT_DEFAULTS, ...spendLimit },
          },
        });
        if ((extra?.length ?? 0) > 0) {
          for (const { id } of extra) {
            await setServerConfiguration({
              id,
              configuration: {
                spendLimit: { ...SPEND_LIMIT_DEFAULTS, ...spendLimit },
              },
            });
          }
        }
      }}
      hasUnsavedChanges={
        !isEqual(
          validatedSpendLimit(
            server.configuration?.spendLimit ?? SPEND_LIMIT_DEFAULTS,
          ),
          validatedSpendLimit(spendLimit),
        ) && spendLimit.dollars != null
      }
      savedEnabled={server.configuration?.spendLimit?.enabled}
    >
      {help && (
        <div style={{ marginBottom: "15px" }}>
          Automatically stop the compute server if the configured spending limit
          is hit.
          <ul>
            <li>
              <b>WARNING:</b> It is still possible to spend more since you pay
              for disk when a compute server is off, and network egress charges
              can take up to 2 days to be known.
            </li>
          </ul>
        </div>
      )}
      <Space direction="vertical" style={{ width: "100%" }}>
        {spendLimit.enabled && (
          <>
            <Flex style={{ alignItems: "center" }}>
              <div
                style={{ flex: 0.5, textAlign: "right", marginRight: "15px" }}
              >
                Limit spend during a given:{" "}
              </div>
              <Radio.Group
                style={{ flex: 0.5 }}
                disabled={saving || !spendLimit.enabled}
                options={[
                  { label: "Day", value: 24 },
                  { label: "Week", value: 24 * 7 },
                  { label: "Month", value: 30.5 * 24 * 7 },
                  { label: "Year", value: 12 * 30.5 * 24 * 7 },
                ]}
                optionType="button"
                buttonStyle="solid"
                value={spendLimit.hours ?? SPEND_LIMIT_DEFAULTS.hours}
                onChange={(e) => {
                  setSpendLimit({ ...spendLimit, hours: e.target.value });
                }}
              />
            </Flex>
            <Flex style={{ alignItems: "center" }}>
              <div
                style={{ flex: 0.5, textAlign: "right", marginRight: "15px" }}
              >
                Maximum amount to spend per {spendLimitPeriod(spendLimit.hours)}
                :{" "}
              </div>
              <div style={{ flex: 0.5 }}>
                <InputNumber
                  style={{ width: "256px" }}
                  disabled={saving || !spendLimit.enabled}
                  min={5}
                  step={5}
                  addonBefore="$"
                  addonAfter="dollars"
                  placeholder="Max spend..."
                  value={spendLimit.dollars}
                  onChange={(dollars) =>
                    setSpendLimit({
                      ...spendLimit,
                      dollars: dollars ?? undefined,
                    })
                  }
                />
              </div>
            </Flex>
          </>
        )}
      </Space>
    </AutomaticShutdownCard>
  );
}

export function SpendLimitModal({ id, project_id, close, extra = [] }) {
  const [help, setHelp] = useState<boolean>(false);
  return (
    <Modal
      width={700}
      open
      onCancel={close}
      onOk={close}
      cancelText="Close"
      okButtonProps={{ style: { display: "none" } }}
      title={
        <div>
          <Inline
            id={id}
            style={{
              display: "block",
              textAlign: "center",
              margin: "-5px 15px 5px 0",
            }}
          />
          <Flex style={{ alignItems: "center" }}>
            <div>
              Limit Spending Rate{" "}
              {extra.length > 0 ? ` for ${extra.length + 1} Servers` : ""}{" "}
            </div>
            <div style={{ flex: 1 }} />
            <Switch
              checkedChildren={"Help"}
              unCheckedChildren={"Help"}
              checked={help}
              onChange={(val) => setHelp(val)}
            />
          </Flex>
        </div>
      }
    >
      {help && <div>Configure limits on spending here.</div>}
      <SpendLimit id={id} project_id={project_id} help={help} extra={extra} />
    </Modal>
  );
}

export function SpendLimitButton(props) {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(!open);
        }}
      >
        Spend Limit
      </Button>
      {open && <SpendLimitModal {...props} close={() => setOpen(false)} />}
    </>
  );
}

export function SpendLimitStatus({ server, horizontal = false }) {
  const [total, setTotal] = useState<number | null>(null);
  const [desc, setDesc] = useState<string>("");

  useEffect(() => {
    if (server.configuration?.spendLimit?.enabled) {
      const { hours, dollars } = validatedSpendLimit(
        server.configuration.spendLimit,
      )!;
      let desc = "";
      const spendValue = toDecimal(server.spend ?? 0);
      if (server.spend != null) {
        desc += `${currency(
          spendValue.toNumber(),
        )} was spent on this compute server in the last ${spendLimitPeriod(hours)}.  `;
      }
      desc += `Spend limit for this server is ${currency(dollars)}/${spendLimitPeriod(hours)}.`;
      setDesc(desc);
      setTotal(spendValue.toNumber());
      return;
    }
    // spend limit not enabled, so put total spend over all time:
    (async () => {
      const { purchases } = await getPurchases({
        compute_server_id: server.id,
        group: true,
      });
      let totalValue = toDecimal(0);
      for (const { cost, cost_so_far } of purchases) {
        totalValue = totalValue.add(cost ?? cost_so_far ?? 0);
      }
      const total = totalValue.toNumber();
      setTotal(total);
      setDesc(
        `${currency(total)} was spent on this compute server since it was created.  No spend limit is set.`,
      );
    })();
  }, [server.id, server.configuration?.spendLimit, server.spend]);

  if (total == null) {
    return null;
  }
  return (
    <Tooltip
      title={() => {
        return (
          <div>
            {desc}
            <div style={{ textAlign: "center" }}>
              <SpendLimitButton id={server.id} project_id={server.project_id} />
            </div>
          </div>
        );
      }}
    >
      <span
        style={
          horizontal ? { display: "flex", alignItems: "center" } : undefined
        }
      >
        <span
          style={{
            color: "#666",
            textWrap: "nowrap",
            margin: horizontal ? "0 5px" : undefined,
          }}
        >
          {currency(total)}
        </span>{" "}
        {!!server.configuration?.spendLimit?.enabled && (
          <Progress
            style={{ width: "60px", height: horizontal ? "19px" : undefined }}
            showInfo={false}
            percent={(total * 100) / server.configuration.spendLimit.dollars}
            strokeWidth={14}
            strokeColor={
              total >= 0.8 * server.configuration.spendLimit.dollars
                ? "red"
                : undefined
            }
          />
        )}
      </span>
    </Tooltip>
  );
}
