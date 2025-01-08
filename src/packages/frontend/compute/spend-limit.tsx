/*
Configuration to limit spending on a particular compute server.
*/

import {
  Button,
  Flex,
  Modal,
  InputNumber,
  Radio,
  Space,
  Spin,
  Switch,
} from "antd";
import { useEffect, useState } from "react";
import { useServer } from "./compute-server";
import Inline from "./inline";
import { isEqual } from "lodash";
import { setServerConfiguration } from "./api";
import {
  type SpendLimit as ISpendLimit,
  SPEND_LIMIT_DEFAULTS,
  spendLimitPeriod,
  validatedSpendLimit,
} from "@cocalc/util/db-schema/compute-servers";
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
    server.configuration?.spendLimit ?? SPEND_LIMIT_DEFAULTS,
  );
  useEffect(() => {
    setSpendLimit(server.configuration?.spendLimit ?? SPEND_LIMIT_DEFAULTS);
  }, [server.configuration?.spendLimit]);

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
