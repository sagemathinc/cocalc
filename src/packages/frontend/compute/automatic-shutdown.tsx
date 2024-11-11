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
  Flex,
  Input,
  Modal,
  InputNumber,
  Space,
  Spin,
} from "antd";
import { useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Inline from "./inline";
import { plural } from "@cocalc/util/misc";
import { AUTOMATIC_SHUTDOWN_DEFAULTS } from "@cocalc/util/db-schema/compute-servers";

async function saveStateControl({ id, project_id, automatic_shutdown }) {
  await webapp_client.async_query({
    query: {
      compute_servers: {
        id,
        project_id,
        automatic_shutdown,
      },
    },
  });
}

function AutomaticShutdown({ id, project_id }) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const [test, setTest] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [command, setCommand] = useState<string | null>("");
  const [attempts, setAttempts] = useState<number | null>(
    AUTOMATIC_SHUTDOWN_DEFAULTS.ATTEMPTS,
  );
  const [interval_minutes, setIntervalMinutes] = useState<number | null>(
    AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES,
  );

  useEffect(() => {
    if (server.automatic_shutdown) {
      if (!command) {
        setCommand(server.automatic_shutdown?.command ?? "");
      }
      if (attempts == null) {
        setAttempts(
          server.automatic_shutdown?.attempts ??
            AUTOMATIC_SHUTDOWN_DEFAULTS.ATTEMPTS,
        );
      }
      if (interval_minutes == null) {
        setIntervalMinutes(
          server.automatic_shutdown?.interval_minutes ??
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
    <div>
      CoCalc will run this bash command line on your compute server in
      /home/user every{" "}
      {interval_minutes ?? AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES}{" "}
      {plural(
        interval_minutes ?? AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES,
        "minute",
      )}
      . If the command fails{" "}
      {`${attempts ?? 1} ${plural(attempts ?? 1, "time")} in a row`}, then
      CoCalc will turn off <Inline id={id} />.
      <Space direction="vertical" style={{ marginTop: "15px" }} size="large">
        <Input
          allowClear
          disabled={saving}
          value={command ?? ""}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Bash Command Line..."
        />
        <Flex>
          <InputNumber
            style={{ flex: 1, marginRight: "15px" }}
            disabled={saving}
            min={1}
            step={1}
            value={attempts}
            onChange={(value) => setAttempts(value)}
            addonAfter="retries"
            placeholder="Retries..."
          />
          <InputNumber
            style={{ flex: 1 }}
            disabled={saving}
            min={1}
            step={1}
            value={interval_minutes}
            onChange={(value) => setIntervalMinutes(value)}
            addonAfter="minutes"
            placeholder="Interval..."
          />
        </Flex>
        <div style={{ textAlign: "center" }}>
          <Space>
            <Button
              disabled={saving}
              onClick={() => {
                setCommand("");
                setAttempts(AUTOMATIC_SHUTDOWN_DEFAULTS.ATTEMPTS);
                save();
              }}
            >
              Disable
            </Button>
            <Button disabled={saving || !command} onClick={doTest}>
              Test
            </Button>
            <Button
              disabled={
                saving ||
                attempts == null ||
                (server.automatic_shutdown?.command == command &&
                  server.automatic_shutdown?.attempts == attempts)
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
        {server.automatic_shutdown?.command ? (
          <Alert
            type="success"
            showIcon
            message="Automatic Shutdown Monitor is Enabled"
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="NOT Enabled (set command line to enable)"
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
    </div>
  );
}

export function AutomaticShutdownModal({ id, project_id, close }) {
  return (
    <Modal
      width={600}
      open
      onCancel={close}
      onOk={close}
      cancelText="Close"
      okButtonProps={{ style: { display: "none" } }}
      title={"Compute Server Automatic Shutdown"}
    >
      <AutomaticShutdown id={id} project_id={project_id} />
    </Modal>
  );
}
