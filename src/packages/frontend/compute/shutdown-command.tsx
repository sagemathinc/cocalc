import { Button, Flex, Input, InputNumber, Space } from "antd";
import { useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { plural } from "@cocalc/util/misc";
import { AUTOMATIC_SHUTDOWN_DEFAULTS } from "@cocalc/util/db-schema/compute-servers";
import { AutomaticShutdownCard, saveComputeServer } from "./automatic-shutdown";

export function ShutdownCommand({ id, project_id, help }) {
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
    server.automatic_shutdown?.interval_minutes ??
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
    <AutomaticShutdownCard
      title="Shell Command"
      icon="terminal"
      setEnabled={(enabled) => {
        setDisabled(!enabled);
      }}
      save={async () => {
        await saveComputeServer({
          id,
          project_id,
          automatic_shutdown: {
            command,
            attempts,
            interval_minutes,
            disabled,
          },
        });
      }}
      savable={
        !(
          attempts == null ||
          (server.automatic_shutdown?.command == command &&
            server.automatic_shutdown?.attempts == attempts &&
            !!server.automatic_shutdown?.disabled == !!disabled)
        )
      }
      savedEnabled={
        !server.automatic_shutdown?.disabled &&
        server.automatic_shutdown?.command?.trim()
      }
      enabled={!disabled}
      saving={saving}
      setSaving={setSaving}
      error={error}
      setError={setError}
    >
      {help && (
        <p style={{ marginBottom: "15px" }}>
          Run this bash command on your compute server in /home/user every{" "}
          {interval_minutes ?? AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES}{" "}
          {plural(
            interval_minutes ?? AUTOMATIC_SHUTDOWN_DEFAULTS.INTERVAL_MINUTES,
            "minute",
          )}
          . If the command fails{" "}
          {`${attempts ?? 1} ${plural(attempts ?? 1, "time")} in a row`}, then
          turn off the compute server.
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
          <Button disabled={saving || !command} onClick={doTest}>
            Test
          </Button>
        </div>
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
    </AutomaticShutdownCard>
  );
}
