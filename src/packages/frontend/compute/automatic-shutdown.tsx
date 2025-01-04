/*
Configuration to automate state control via backend maintenance task.

The only thing we implement so far is "script", see StateControl in

https://wstein-dev.cocalc.cloud/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/files/cocalc/src/packages/util/db-schema/compute-servers.ts

It gets configured here.  A maintenance process on the backend periodically checks the idle timeout conditions,
and if met, shuts down the compute server.
*/

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Input,
  Modal,
  InputNumber,
  Space,
  Spin,
  Switch,
} from "antd";
import { useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Inline from "./inline";
import { plural } from "@cocalc/util/misc";
import {
  AUTOMATIC_SHUTDOWN_DEFAULTS,
  IDLE_TIMEOUT_DEFAULT_MINUTES,
} from "@cocalc/util/db-schema/compute-servers";

async function saveStateControl(obj) {
  const query = {
    compute_servers: obj,
  };
  await webapp_client.async_query({ query });
}

function AutomaticShutdown({ id, project_id, help }) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const [test, setTest] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [command, setCommand] = useState<string | null>("");
  const [attempts, setAttempts] = useState<number | null>(
    server?.automatic_shutdown?.attempts ??
      AUTOMATIC_SHUTDOWN_DEFAULTS.ATTEMPTS,
  );
  const [interval_minutes, setIntervalMinutes] = useState<number | null>(
    server.automatic_shutdown.interval_minutes ??
      AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES,
  );
  const [disabled, setDisabled] = useState<boolean>(
    !!server.automatic_shutdown?.disabled,
  );

  useEffect(() => {
    if (server.automatic_shutdown) {
      setDisabled(!!server.automatic_shutdown.disabled);
      if (!command) {
        setCommand(server.automatic_shutdown.command ?? "");
      }
      if (attempts == null) {
        setAttempts(
          server.automatic_shutdown.attempts ??
            AUTOMATIC_SHUTDOWN_DEFAULTS.ATTEMPTS,
        );
      }
      if (interval_minutes == null) {
        setIntervalMinutes(
          server.automatic_shutdown.interval_minutes ??
            AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES,
        );
      }
    }
  }, [server?.automatic_shutdown]);

  const save = async () => {
    try {
      setSaving(true);
      await saveStateControl({
        id,
        project_id,
        automatic_shutdown: {
          command,
          attempts,
          interval_minutes,
          disabled,
        },
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      // a little delay makes the feedback with setting above again and disabled just
      // feel cleaner.  It also reduces potential load.
      setTimeout(() => setSaving(false), 1000);
    }
  };

  const doTest = async () => {
    try {
      setSaving(true);
      setTest("");
      const resp = await webapp_client.exec({
        filesystem: false,
        compute_server_id: id,
        project_id,
        command,
        bash: true,
        err_on_exit: false,
      });
      delete resp.type;
      setTest(JSON.stringify(resp, undefined, 2));
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Automatic Shutdown">
      {help && (
        <p style={{ marginBottom: "15px" }}>
          CoCalc will run this bash command line on your compute server in
          /home/user every{" "}
          {interval_minutes ?? AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES}{" "}
          {plural(
            interval_minutes ?? AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES,
            "minute",
          )}
          . If the command fails{" "}
          {`${attempts ?? 1} ${plural(attempts ?? 1, "time")} in a row`}, then
          CoCalc will turn off the compute server.
        </p>
      )}
      <Space direction="vertical" size="large">
        <Input
          allowClear
          disabled={saving}
          value={command ?? ""}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={`Bash Command Line -- shutdown when this fails ${attempts} times...`}
        />
        <Flex>
          <InputNumber
            style={{ flex: 1, marginRight: "15px" }}
            disabled={saving}
            min={1}
            step={1}
            value={attempts}
            onChange={(value) => setAttempts(value)}
            addonAfter="attempts before shutdown"
            placeholder="Attempts..."
          />
          <InputNumber
            style={{ flex: 1 }}
            disabled={saving}
            min={1}
            step={1}
            value={interval_minutes}
            onChange={(value) => setIntervalMinutes(value)}
            addonAfter="minutes between attempts"
            placeholder="Interval..."
          />
        </Flex>
        <div style={{ textAlign: "center" }}>
          <Space>
            <Checkbox
              disabled={saving}
              checked={!disabled}
              onChange={(e) => {
                setDisabled(!e.target.checked);
              }}
            >
              Enable{disabled ? "" : "d"}
            </Checkbox>
            <Button disabled={saving || !command} onClick={doTest}>
              Test
            </Button>
            <Button
              disabled={
                saving ||
                attempts == null ||
                (server.automatic_shutdown?.command == command &&
                  server.automatic_shutdown?.attempts == attempts &&
                  !!server.automatic_shutdown?.disabled == !!disabled)
              }
              type="primary"
              onClick={() => {
                save();
              }}
            >
              Save {saving && <Spin style={{ marginLeft: "5px" }} />}
            </Button>
          </Space>
        </div>
        {!server.automatic_shutdown?.disabled &&
        server.automatic_shutdown?.command?.trim() ? (
          <Alert
            type="success"
            showIcon
            message="Automatic Shutdown Monitor is Enabled"
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Automatic Shutdown NOT Enabled (set command, check 'Enable' and save)"
          />
        )}
        {test && (
          <pre
            style={{
              width: "550px",
              overflow: "auto",
              background: "#e8e8e8",
              padding: "15px",
              borderRadius: "15px",
            }}
          >
            {test}
          </pre>
        )}
        <ShowError
          error={error}
          setError={setError}
          style={{ width: "100%" }}
        />
      </Space>
    </Card>
  );
}

function IdleTimeout({ id, project_id, help }) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [enabled, setEnabled] = useState<boolean>(!!server.idle_timeout);
  const [idle_timeout, set_idle_timeout] = useState<number | null>(
    server.idle_timeout ?? null,
  );
  useEffect(() => {
    set_idle_timeout(server.idle_timeout);
  }, [server.idle_timeout]);

  const save = async () => {
    try {
      setSaving(true);
      await saveStateControl({
        id,
        project_id,
        idle_timeout,
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setTimeout(() => setSaving(false), 1000);
    }
  };

  return (
    <Card title="Idle Timeout">
      {help && (
        <div style={{ marginBottom: "15px" }}>
          <p>
            CoCalc will automatically stop the compute server if no terminal or
            file (e.g., Jupyter notebook) on this compute server is used through
            the web interface for a given numbers of minutes. CPU and GPU usage
            is not taken into account.
          </p>
          <ul>
            <li>
              Idle timeout for compute servers has no direct impact on their
              cost. Indirectly, setting an idle timeout can save you a huge
              amount of money, depending on your usage patterns!
            </li>
            <li>
              Compute server idle timeout is unrelated to your home base's idle
              timeout. Any time a compute server is running, it keeps the home
              base project running, which effectively gives the home base a long
              idle timeout (so no need to buy one using a license).
            </li>
          </ul>
        </div>
      )}
      <Flex style={{ alignItems: "center" }}>
        <Checkbox
          disabled={saving}
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (e.target.checked) {
              set_idle_timeout(IDLE_TIMEOUT_DEFAULT_MINUTES);
            } else {
              set_idle_timeout(0);
            }
          }}
        >
          Enable{enabled ? "d" : ""}
        </Checkbox>
        <div style={{ width: "50px" }} />
        <Space>
          <InputNumber
            disabled={saving || !enabled}
            min={0}
            step={15}
            value={idle_timeout}
            onChange={(value) => set_idle_timeout(value)}
            addonAfter="timeout minutes"
            placeholder="Idle timeout..."
          />
          <Button
            type="primary"
            disabled={saving || (server.idle_timeout ?? 0) == idle_timeout}
            onClick={save}
          >
            Save {saving && <Spin style={{ marginLeft: "5px" }} />}
          </Button>
        </Space>
      </Flex>
      <ShowError error={error} setError={setError} style={{ width: "100%" }} />
      {server.idle_timeout ? (
        <Alert
          style={{ marginTop: "15px" }}
          type="success"
          showIcon
          message="Idle Timeout Monitor is Enabled"
        />
      ) : (
        <Alert
          style={{ marginTop: "15px" }}
          type="info"
          showIcon
          message="Idle Timeout Monitor NOT Enabled (check 'Enable', set timeout and save)"
        />
      )}
    </Card>
  );
}

export function AutomaticShutdownModal({ id, project_id, close }) {
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
            <div>Idle Timeout and Automatic Shutdown</div>
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
      <IdleTimeout id={id} project_id={project_id} help={help} />
      <div style={{ height: "15px" }} />
      <AutomaticShutdown id={id} project_id={project_id} help={help} />
    </Modal>
  );
}
