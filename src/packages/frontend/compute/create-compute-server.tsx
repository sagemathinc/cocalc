import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { createServer } from "./api";
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
  color: "#888",
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
      setCreating(true);
      onCreate();
      try {
        await createServer({ project_id, cloud, title, color, configuration });
        setEditing(false);
        setTitle(DEFAULTS.title());
        setColor(DEFAULTS.color);
        setCloud(DEFAULTS.cloud);
        setConfiguration(DEFAULTS.configuration);
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
        disabled={creating || editing}
        onClick={() => {
          setEditing(true);
        }}
      >
        <Icon name="plus-circle" /> Create New Compute Server...{" "}
        {creating ? <Spin /> : null}
      </Button>
      {editing && (
        <div style={{ marginTop: "15px" }}>
          <ShowError error={error} setError={setError} />
          <div
            style={{
              marginBottom: "5px",
              color: "#666",
              textAlign: "center",
            }}
          >
            Customize your new compute server, then click "Start" below. You can
            always change everything later.
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
          <div style={{ marginTop: "15px" }}>
            <Button size="large" onClick={() => setEditing(false)}>
              Cancel
            </Button>{" "}
            <Button size="large" type="primary" onClick={handleCreate}>
              <Icon name="run" /> Start "{title}" Running
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
