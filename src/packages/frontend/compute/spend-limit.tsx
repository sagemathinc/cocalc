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

function SpendLimit({
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
    <Card title={<>Spending Limit</>}>
      {help && (
        <div style={{ marginBottom: "15px" }}>Explain spending limits</div>
      )}
      <Space direction="vertical">
        <Checkbox
          disabled={saving}
          checked={spendLimit.enabled}
          onChange={(e) => {
            setSpendLimit({ ...spendLimit, enabled: e.target.checked });
          }}
        >
          Enable{spendLimit.enabled ? "d" : ""}
        </Checkbox>
        <Radio.Group
          disabled={saving || !spendLimit.enabled}
          options={[
            { label: "Day", value: 24 },
            { label: "Week", value: 24 * 7 },
            { label: "Month", value: 30.5 * 24 * 7 },
            { label: "Year", value: 12 * 30.5 * 24 * 7 },
          ]}
          optionType="button"
          buttonStyle="solid"
          value={spendLimit?.hours ?? SPEND_LIMIT_DEFAULTS.hours}
          onChange={(e) => {
            setSpendLimit({ ...spendLimit, hours: e.target.value });
          }}
        />
        <InputNumber
          disabled={saving || !spendLimit.enabled}
          min={1}
          step={20}
          addonBefore="$"
          addonAfter="dollars"
          placeholder="Dollars..."
          value={spendLimit?.dollars ?? SPEND_LIMIT_DEFAULTS.dollars}
          onChange={(dollars) =>
            setSpendLimit({ ...spendLimit, dollars: dollars ?? undefined })
          }
        />
        <Button
          type="primary"
          disabled={
            saving || isEqual(server.configuration?.spendLimit, spendLimit)
          }
          onClick={save}
        >
          Save {saving && <Spin style={{ marginLeft: "5px" }} />}
        </Button>
      </Space>
      <ShowError error={error} setError={setError} style={{ width: "100%" }} />
      {server.configuration?.spendLimit?.enabled ? (
        <Alert
          style={{ marginTop: "15px" }}
          type="success"
          showIcon
          message="Spending Limit is Enabled"
        />
      ) : (
        <Alert
          style={{ marginTop: "15px" }}
          type="info"
          showIcon
          message="Spending Limit is NOT Enabled"
        />
      )}
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
