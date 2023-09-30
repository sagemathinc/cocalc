import { Button, Modal, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { createServer, computeServerAction } from "./api";
import { useEffect, useState } from "react";
import { availableClouds } from "./config";
import {
  CLOUDS_BY_NAME,
  Cloud as CloudType,
} from "@cocalc/util/db-schema/compute-servers";
import ShowError from "@cocalc/frontend/components/error";
import ComputeServer from "./compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

const DEFAULTS = {
  title: () => `Untitled ${new Date().toISOString().split("T")[0]}`,
  color: "#2196f3",
  cloud: availableClouds()[0],
  configuration: CLOUDS_BY_NAME[availableClouds()[0]].defaultConfiguration,
};

export default function CreateComputeServer({ project_id, onCreate }) {
  const account_id = useTypedRedux("account", "account_id");
  const [editing, setEditing] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [title, setTitle] = useState<string>(DEFAULTS.title);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [cloud, setCloud] = useState<CloudType>(DEFAULTS.cloud);
  const [configuration, setConfiguration] = useState<any>(
    DEFAULTS.configuration,
  );

  useEffect(() => {
    if (configuration.cloud != cloud) {
      setConfiguration(CLOUDS_BY_NAME[cloud].defaultConfiguration);
    }
  }, [cloud]);

  const handleCreate = async () => {
    try {
      setError("");
      onCreate();
      try {
        setCreating(true);
        const id = await createServer({
          project_id,
          cloud,
          title,
          color,
          configuration,
        });
        setEditing(false);
        setTitle(DEFAULTS.title());
        setColor(DEFAULTS.color);
        setCloud(DEFAULTS.cloud);
        setConfiguration(DEFAULTS.configuration);
        setCreating(false);
        (async () => {
          try {
            await computeServerAction({ id, action: "start" });
          } catch (_) {}
        })();
      } catch (err) {
        setError(`${err}`);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ marginTop: "15px" }}>
      <Button
        size="large"
        disabled={creating || editing}
        onClick={() => {
          setEditing(true);
        }}
        style={{
          marginRight: "5px",
          width: "100%",
          height: "auto",
          whiteSpace: "normal",
          padding: "10px",
          ...(creating
            ? {
                borderColor: "rgb(22, 119, 255)",
                backgroundColor: "rgb(230, 244, 255)",
              }
            : undefined),
        }}
      >
        <Icon
          name="server"
          style={{ color: "rgb(66, 139, 202)", fontSize: "200%" }}
        />
        <br />
        Create Compute Server... {creating ? <Spin /> : null}
      </Button>
      <Modal
        width={"900px"}
        onCancel={() => setEditing(false)}
        open={editing}
        title={"Create Compute Server"}
        footer={[
          <div style={{ textAlign: "center" }}>
            <Button size="large" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              onClick={handleCreate}
              disabled={!!error || !title.trim()}
            >
              <Icon name="run" /> Start Compute Server
              {!!error && "(clear error) "}
              {!title.trim() && "(set title) "}
            </Button>
          </div>,
        ]}
      >
        <div style={{ marginTop: "15px" }}>
          <ShowError error={error} setError={setError} />
          <div
            style={{
              marginBottom: "5px",
              color: "#666",
              textAlign: "center",
            }}
          >
            Customize your compute server below, then{" "}
            <Button onClick={handleCreate} disabled={!!error || !title.trim()}>
              <Icon name="run" /> Start It
            </Button>
          </div>
          <ComputeServer
            project_id={project_id}
            account_id={account_id}
            title={title}
            color={color}
            cloud={cloud}
            configuration={configuration}
            editable={!creating}
            onColorChange={setColor}
            onTitleChange={setTitle}
            onCloudChange={setCloud}
            onConfigurationChange={setConfiguration}
          />
        </div>
      </Modal>
    </div>
  );
}
