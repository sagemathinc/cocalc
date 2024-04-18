import { Button, Modal, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import {
  createServer,
  computeServerAction,
  setServerConfiguration,
} from "./api";
import { useEffect, useState } from "react";
import { availableClouds } from "./config";
import {
  CLOUDS_BY_NAME,
  Cloud as CloudType,
} from "@cocalc/util/db-schema/compute-servers";
import { replace_all } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import ComputeServer from "./compute-server";
import { useTypedRedux, useRedux, redux } from "@cocalc/frontend/app-framework";
import { randomColor } from "./color";
import confirmStartComputeServer from "@cocalc/frontend/purchases/pay-as-you-go/confirm-start-compute-server";
import costPerHour from "./cost";
import { Docs } from "./compute-servers";

function defaultTitle() {
  return `Untitled ${new Date().toISOString().split("T")[0]}`;
}

// NOTE that availableClouds() will be empty the moment the page
// loads, but give correct results once customize is loaded right
// after user has loaded page.  By the time they are creating a NEW
// compute server, this should all be working fine.

function defaultCloud() {
  return availableClouds()[0];
}

function defaultConfiguration() {
  return genericDefaults(
    CLOUDS_BY_NAME[availableClouds()[0]]?.defaultConfiguration ?? {},
  );
}

function genericDefaults(conf) {
  return { ...conf, excludeFromSync: ["compute-server-[id]"] };
}

export default function CreateComputeServer({ project_id, onCreate }) {
  const account_id = useTypedRedux("account", "account_id");
  const create_compute_server = useRedux(["create_compute_server"], project_id);
  const [editing, setEditing] = useState<boolean>(create_compute_server);
  useEffect(() => {
    if (create_compute_server) {
      redux
        .getProjectActions(project_id)
        .setState({ create_compute_server: false });
    }
  }, [create_compute_server]);
  const [creating, setCreating] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [title, setTitle] = useState<string>(defaultTitle());
  const [color, setColor] = useState<string>(randomColor());
  const [cloud, setCloud] = useState<CloudType>(defaultCloud());
  const [configuration, setConfiguration] = useState<any>(
    defaultConfiguration(),
  );

  const resetConfig = () => {
    setTitle(defaultTitle());
    setColor(randomColor());
    setCloud(defaultCloud());
    setConfiguration(defaultConfiguration());
  };

  useEffect(() => {
    if (configuration != null && configuration.cloud != cloud) {
      setConfiguration(
        genericDefaults(CLOUDS_BY_NAME[cloud]?.defaultConfiguration),
      );
    }
  }, [cloud]);

  const handleCreate = async (start: boolean) => {
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
        await updateFastDataDirectoryId(id, configuration);
        setEditing(false);
        resetConfig();
        setCreating(false);
        if (start && cloud != "onprem") {
          (async () => {
            try {
              await confirmStartComputeServer({
                id,
                cost_per_hour: await costPerHour({
                  configuration,
                  state: "running",
                }),
              });
              await computeServerAction({ id, action: "start" });
            } catch (_) {}
          })();
        }
      } catch (err) {
        setError(`${err}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const footer = [
    <div style={{ textAlign: "center" }} key="footer">
      <Button
        key="cancel"
        size="large"
        onClick={() => setEditing(false)}
        style={{ marginRight: "5px" }}
      >
        Cancel
      </Button>
      {cloud != "onprem" && (
        <Button
          style={{ marginRight: "5px" }}
          key="start"
          size="large"
          type="primary"
          onClick={() => {
            handleCreate(true);
          }}
          disabled={!!error || !title.trim()}
        >
          <Icon name="run" /> Start Server
          {!!error && "(clear error) "}
          {!title.trim() && "(set title) "}
        </Button>
      )}
      <Button
        key="create"
        size="large"
        onClick={() => {
          handleCreate(false);
        }}
        disabled={!!error || !title.trim()}
      >
        <Icon name="run" /> Create Server
        {cloud != "onprem" ? " (don't start)" : ""}
        {!!error && "(clear error) "}
        {!title.trim() && "(set title) "}
      </Button>
    </div>,
  ];

  return (
    <div style={{ marginTop: "15px" }}>
      <Button
        size="large"
        disabled={creating || editing}
        onClick={() => {
          resetConfig();
          setEditing(true);
        }}
        style={{
          marginRight: "5px",
          width: "80%",
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
          style={{
            color: "rgb(66, 139, 202)",
            fontSize: "200%",
          }}
        />
        <br />
        Create Compute Server... {creating ? <Spin /> : null}
      </Button>
      <Modal
        width={"900px"}
        onCancel={() => {
          setEditing(false);
          resetConfig();
        }}
        open={editing}
        destroyOnClose
        title={"Create Compute Server"}
        footer={
          <div style={{ display: "flex" }}>
            {footer}
            <Docs key="docs" style={{ flex: 1, marginTop: "10px" }} />
          </div>
        }
      >
        <div style={{ marginTop: "15px" }}>
          <ShowError error={error} setError={setError} />
          {cloud != "onprem" && (
            <div
              style={{
                marginLeft: "15px",
                marginBottom: "5px",
                color: "#666",
                textAlign: "center",
              }}
            >
              Customize your compute server below, then{" "}
              <Button
                onClick={() => handleCreate(true)}
                disabled={!!error || !title.trim()}
                type={"primary"}
              >
                <Icon name="run" /> Start Server
              </Button>
            </div>
          )}
          {cloud == "onprem" && (
            <div
              style={{
                marginLeft: "15px",
                marginBottom: "5px",
                color: "#666",
                textAlign: "center",
              }}
            >
              Customize your compute server below, then
              <Button
                onClick={() => handleCreate(false)}
                disabled={!!error || !title.trim()}
                type={"primary"}
              >
                <Icon name="run" /> Create Server
              </Button>
            </div>
          )}
          <ComputeServer
            server={{
              project_id,
              account_id,
              title,
              color,
              cloud,
              configuration,
            }}
            editable={!creating}
            controls={{
              onColorChange: setColor,
              onTitleChange: setTitle,
              onCloudChange: setCloud,
              onConfigurationChange: setConfiguration,
            }}
          />
        </div>
      </Modal>
    </div>
  );
}

async function updateFastDataDirectoryId(id: number, configuration) {
  const { excludeFromSync } = configuration;
  if (excludeFromSync == null || excludeFromSync.length == 0) {
    return;
  }
  const changes = {
    excludeFromSync: excludeFromSync.map((x) =>
      replace_all(x, "[id]", `${id}`),
    ),
  };
  await setServerConfiguration({ id, configuration: changes });
}
