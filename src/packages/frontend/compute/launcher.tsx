/*
Launcher buttons shown for a running compute server.
*/

import { Button, Modal, Spin, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useImages } from "@cocalc/frontend/compute/images-hook";
import { useMemo, useState } from "react";
import { LauncherButton, getRoute } from "./proxy";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import { getApps } from "./menu";

export default function Launcher({
  style,
  configuration,
  data,
  compute_server_id,
  project_id,
}) {
  const [appName, setAppName] = useState<string>("");
  const image = configuration?.image;
  if (image == null || data == null || configuration == null) {
    return null;
  }
  const apps = getApps(image);
  if (!apps) {
    return null;
  }
  return (
    <div style={style}>
      {!!appName && (
        <AppLauncherModal
          id={compute_server_id}
          name={appName}
          project_id={project_id}
          close={() => setAppName("")}
        />
      )}
      {/*<Button
        onClick={() => setAppName("explorer")}
        type="text"
        size="small"
        style={{ color: "#666" }}
      >
        <Icon name="folder-open" /> Explorer
      </Button>*/}

      {apps["jupyterlab"] != null && (
        <Tooltip title={apps["jupyterlab"].tip} placement="left">
          <Button
            onClick={() => setAppName("jupyterlab")}
            type="text"
            size="small"
            style={{ color: "#666" }}
          >
            <Icon
              name={apps["jupyterlab"].icon}
              style={{ marginRight: "-5px" }}
            />
            JupyterLab
          </Button>
        </Tooltip>
      )}
      {apps["vscode"] != null && (
        <Tooltip title={apps["vscode"].tip} placement="left">
          <Button
            onClick={() => setAppName("vscode")}
            type="text"
            size="small"
            style={{ color: "#666" }}
          >
            <Icon name={apps["vscode"].icon} style={{ marginRight: "-5px" }} />
            VS Code
          </Button>
        </Tooltip>
      )}
      {apps["xpra"] != null && (
        <Tooltip title={apps["xpra"].tip} placement="left">
          <Button
            onClick={() => setAppName("xpra")}
            type="text"
            size="small"
            style={{ color: "#666" }}
          >
            <Icon name={apps["xpra"].icon} style={{ marginRight: "-5px" }} />
            Desktop
          </Button>
        </Tooltip>
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
  const route = useMemo(() => {
    try {
      return getRoute({ app, configuration, IMAGES });
    } catch (err) {
      setError(`${err}`);
      return null;
    }
  }, [app, configuration, IMAGES]);

  return (
    <div>
      {route && (
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
      )}
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0", width: "100%" }}
      />
    </div>
  );
}

// function ExplorerLauncher({ compute_server_id, project_id }) {
//   return (
//     <div>
//       {compute_server_id} {project_id}
//     </div>
//   );
// }

export function AppLauncherModal({
  name,
  id,
  project_id,
  close,
}: {
  name: string;
  id: number;
  project_id: string;
  close: () => void;
}) {
  const server = useServer({ id, project_id });
  const [IMAGES] = useImages();
  if (server == null || IMAGES == null) {
    return <Spin />;
  }
  const image = server.configuration?.image ?? "defaults";
  const apps = getApps(image);

  return (
    <Modal
      title={
        <>
          <Icon
            name={apps[name]?.icon ?? "global"}
            style={{ marginRight: "5px" }}
          />
          {apps[name]?.label ?? name}
        </>
      }
      open
      onOk={close}
      onCancel={close}
      destroyOnHidden
    >
      {apps[name]?.tip}
      <AppLauncher
        name={name}
        configuration={server.configuration}
        data={server.data}
        compute_server_id={server.id}
        project_id={project_id}
        IMAGES={IMAGES}
      />
    </Modal>
  );
}
