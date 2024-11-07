/*
Configuration to automate state control via backend maintenance task.

The only thing we implement so far is "script", see StateControl in

https://wstein-dev.cocalc.cloud/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/files/cocalc/src/packages/util/db-schema/compute-servers.ts

It gets configured here.  A maintenance process on the backend periodically checks the idle timeout conditions,
and if met, shuts down the compute server.
*/

import { Button, Flex, Input, Modal, InputNumber, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Inline from "./inline";
import { plural } from "@cocalc/util/misc";

const INTERVAL_MINUTES = 3;

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
  const [saving, setSaving] = useState<boolean>(false);
  const [command, setCommand] = useState<string>("");
  const [exit_code, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    if (server.automatic_shutdown) {
      setCommand(server.automatic_shutdown.command ?? "");
      setExitCode(server.automatic_shutdown.exit_code ?? null);
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
          exit_code,
          interval_minutes: INTERVAL_MINUTES,
        },
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      // a little delay makes the feedback with setting above again and disabled just
      // feel cleaner.  It also reduces potential load.
      setTimeout(() => setSaving(false), 2000);
    }
  };

  return (
    <div>
      CoCalc will run the following command on your compute server once every{" "}
      {INTERVAL_MINUTES} {plural(INTERVAL_MINUTES, "minute")}. If the command
      exits with the specified exit code, then CoCalc will turn off{" "}
      <Inline id={id} />.
      <Flex style={{ width: "100%", margin: "15px 0" }}>
        <Input
          style={{ flex: 1, marginRight: "15px" }}
          disabled={saving}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Command..."
        />
        <InputNumber
          style={{ width: "150px" }}
          disabled={saving}
          min={0}
          max={255}
          step={1}
          value={exit_code}
          onChange={(value) => setExitCode(value)}
          placeholder="Exit code..."
        />
      </Flex>
      <Space>
        <Button
          disabled={saving}
          onClick={() => {
            setCommand("");
            setExitCode(null);
            save();
          }}
        >
          Clear
        </Button>
        <Button
          disabled={
            saving ||
            !command ||
            exit_code == null ||
            (server.automatic_shutdown.command == command &&
              server.automatic_shutdown.exit_code == exit_code)
          }
          type="primary"
          onClick={() => {
            save();
          }}
        >
          Save {saving && <Spin style={{ marginLeft: "5px" }} />}
        </Button>
      </Space>
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0", width: "100%" }}
      />
    </div>
  );
}

export function AutomaticShutdownModal({ id, project_id, close }) {
  return (
    <Modal
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
