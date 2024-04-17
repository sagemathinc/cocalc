/*
Launcher buttons shown for a running compute server.
*/

import { Button, Modal } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useImages } from "@cocalc/frontend/compute/images-hook";
import { useState } from "react";
import { LauncherButton, getRoute } from "./proxy";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";

export default function Launcher({
  style,
  configuration,
  data,
  compute_server_id,
  project_id,
}) {
  const [appName, setAppName] = useState<string>("");
  const [IMAGES] = useImages();
  const image = configuration?.image;
  if (
    IMAGES == null ||
    image == null ||
    data == null ||
    configuration == null
  ) {
    return null;
  }
  const apps = IMAGES[image]?.apps ?? IMAGES["defaults"]?.apps ?? {};
  return (
    <div style={style}>
      <Modal
        title={
          <>
            <Icon name={apps[appName]?.icon ?? "global"} />
            {apps[appName]?.label ?? appName}
          </>
        }
        open={!!appName}
        onOk={() => setAppName("")}
        onCancel={() => setAppName("")}
        destroyOnClose
      >
        {(appName == "vscode" || appName == "jupyterlab") && (
          <AppLauncher
            name={appName}
            configuration={configuration}
            data={data}
            compute_server_id={compute_server_id}
            project_id={project_id}
            IMAGES={IMAGES}
          />
        )}
        {appName == "explorer" && (
          <ExplorerLauncher
            compute_server_id={compute_server_id}
            project_id={project_id}
          />
        )}
      </Modal>
      {/*<Button
        onClick={() => setAppName("explorer")}
        type="text"
        size="small"
        style={{ color: "#666" }}
      >
        <Icon name="folder-open" /> Explorer
      </Button>*/}
      {apps["vscode"] != null && (
        <Button
          onClick={() => setAppName("vscode")}
          type="text"
          size="small"
          style={{ color: "#666" }}
        >
          <Icon name={apps["vscode"].icon} /> VS Code
        </Button>
      )}
      {apps["jupyterlab"] != null && (
        <Button
          onClick={() => setAppName("jupyterlab")}
          type="text"
          size="small"
          style={{ color: "#666" }}
        >
          <Icon name={apps["jupyterlab"].icon} /> Jupyter
        </Button>
      )}
    </div>
  );
}

function AppLauncher({
  name,
  configuration,
  data,
  compute_server_id,
  project_id,
  IMAGES,
}) {
  const [error, setError] = useState<string>("");
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  const image = configuration.image;
  const app = (IMAGES[image]?.apps ?? IMAGES["defaults"]?.apps ?? [])[name];
  if (app == null) {
    return <ShowError error={`Unknown application '${name}'`} />;
  }
  const route = getRoute({ app, configuration, IMAGES });
  return (
    <div>
      <LauncherButton
        name={name}
        app={app}
        compute_server_id={compute_server_id}
        project_id={project_id}
        configuration={configuration}
        data={data}
        compute_servers_dns={compute_servers_dns}
        setError={setError}
        route={route}
        noHide
        autoLaunch
      />
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0", width: "100%" }}
      />
    </div>
  );
}

function ExplorerLauncher({ compute_server_id, project_id }) {
  return (
    <div>
      {compute_server_id} {project_id}
    </div>
  );
}
