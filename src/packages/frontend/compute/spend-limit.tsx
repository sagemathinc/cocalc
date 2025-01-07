/*
Configuration to limit spending on a particular compute server.
*/

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Modal,
  InputNumber,
  Radio,
  Space,
  Spin,
  Switch,
} from "antd";
import { useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import Inline from "./inline";
import { isEqual } from "lodash";
import { setServerConfiguration } from "./api";
import {
  type SpendLimit as ISpendLimit,
  SPEND_LIMIT_DEFAULTS,
} from "@cocalc/util/db-schema/compute-servers";

export function SpendLimit({
  id,
  project_id,
  help,
}: {
  id: number;
  project_id: string;
  help?: boolean;
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

  console.log({ spendLimit, s: server?.configuration?.spendLimit });

  const save = async () => {
    try {
      setSaving(true);
      console.log(spendLimit);
      await setServerConfiguration({
        id,
        configuration: {
          spendLimit: { ...SPEND_LIMIT_DEFAULTS, ...spendLimit },
        },
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setTimeout(() => setSaving(false), 1000);
    }
  };

  return (
    <Card
      styles={{
        body: spendLimit.enabled ? undefined : { display: "none" },
      }}
      title={
        <Flex style={{ alignItems: "center" }}>
          <div>Spending Limit</div>
          <div style={{ flex: 1 }} />
          <Space>
            <Checkbox
              disabled={saving}
              checked={spendLimit.enabled}
              onChange={(e) => {
                setSpendLimit({ ...spendLimit, enabled: e.target.checked });
              }}
            >
              Enable{spendLimit.enabled ? "d" : ""}
            </Checkbox>
            <Button
              type="primary"
              disabled={
                saving ||
                isEqual(server.configuration?.spendLimit, spendLimit) ||
                spendLimit.dollars == null
              }
              onClick={save}
            >
              Save {saving && <Spin style={{ marginLeft: "5px" }} />}
            </Button>
          </Space>
          <div style={{ flex: 1 }} />
          {server.configuration?.spendLimit?.enabled ? (
            <Alert
              style={{ marginLeft: "15px" }}
              type="success"
              showIcon
              message="Spending Limit is Enabled"
            />
          ) : (
            <Alert
              style={{ marginLeft: "15px" }}
              type="info"
              showIcon
              message="Spending Limit is NOT Enabled"
            />
          )}
        </Flex>
      }
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
                Maximum amount to spend per {period(spendLimit.hours)}:{" "}
              </div>
              <div style={{ flex: 0.5 }}>
                <InputNumber
                  style={{ width: "256px" }}
                  disabled={saving || !spendLimit.enabled}
                  min={1}
                  step={20}
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
      <ShowError
        error={error}
        setError={setError}
        style={{ width: "100%", marginTop: "15px" }}
      />
    </Card>
  );
}

export function SpendLimitModal({ id, project_id, close }) {
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
          <Flex style={{ marginRight: "20px", alignItems: "center" }}>
            <div>Limit Spending Rate</div>
            <div style={{ width: "25px" }} />
            <Switch
              size="small"
              checkedChildren={"Help"}
              unCheckedChildren={"Help"}
              checked={help}
              onChange={(val) => setHelp(val)}
            />
          </Flex>
          <Inline id={id} />
        </div>
      }
    >
      <SpendLimit id={id} project_id={project_id} help={help} />
    </Modal>
  );
}

function period(hours) {
  if (hours == 24) {
    return "day";
  }
  if (hours == 24 * 7) {
    return "week";
  }
  if (hours == 30.5 * 24 * 7) {
    return "month";
  }
  if (hours == 12 * 30.5 * 24 * 7) {
    return "year";
  }
  return `${hours} hours`;
}
