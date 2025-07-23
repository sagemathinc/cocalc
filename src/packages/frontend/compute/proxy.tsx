/*
The HTTPS proxy server.
*/

import { Alert, Button, Input, Spin, Switch } from "antd";
import { delay } from "awaiting";
import jsonic from "jsonic";
import { useEffect, useMemo, useRef, useState } from "react";

import { A, Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { PROXY_CONFIG } from "@cocalc/util/compute/constants";
import AuthToken from "./auth-token";
import { writeTextFileToComputeServer } from "./project";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { TimeAgo } from "@cocalc/frontend/components";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { defaultProxyConfig } from "@cocalc/util/compute/images";
import { EditModal } from "./compute-server";
import { getQuery } from "./description";

export default function Proxy({
  id,
  project_id,
  setConfig,
  configuration,
  data,
  state,
  IMAGES,
}) {
  const [help, setHelp] = useState<boolean>(false);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <div>
          <b>
            <Switch
              size="small"
              checkedChildren={"Help"}
              unCheckedChildren={"Help"}
              style={{ float: "right" }}
              checked={help}
              onChange={(val) => setHelp(val)}
            />
            <Icon name="global" /> Web Applications: VS Code, JupyterLab, etc.
          </b>
        </div>
        {help && (
          <Alert
            showIcon
            style={{ margin: "15px 0" }}
            type="info"
            message={"Proxy"}
            description={
              <div>
                You can directly run servers such as JupyterLab, VS Code, and
                Pluto on your compute server. The authorization token is used so
                you and your project collaborators can access these servers.
                <br />
                <br />
                <b>NOTE:</b> It can take a few minutes for an app to start
                running the first time you launch it.
                <br />
                <br />
                <b>WARNING:</b> You will see a security warning if you don't
                configure a domain name. In some cases, e.g., JupyterLab via
                Chrome, you <i>must</i> configure a domain name (due to a bug in
                Chrome).
              </div>
            }
          />
        )}
        <ProxyConfig
          id={id}
          project_id={project_id}
          setConfig={setConfig}
          configuration={configuration}
          state={state}
          IMAGES={IMAGES}
        />
        <AuthToken
          id={id}
          project_id={project_id}
          setConfig={setConfig}
          configuration={configuration}
          state={state}
          IMAGES={IMAGES}
        />
        <Apps
          state={state}
          configuration={configuration}
          data={data}
          IMAGES={IMAGES}
          style={{ marginTop: "10px" }}
          compute_server_id={id}
          project_id={project_id}
        />
      </div>
    </div>
  );
}

function getProxy({ IMAGES, configuration }) {
  return (
    configuration?.proxy ??
    defaultProxyConfig({ image: configuration?.image, IMAGES })
  );
}

function ProxyConfig({
  id,
  project_id,
  setConfig,
  configuration,
  state,
  IMAGES,
}) {
  const [edit, setEdit] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const proxy = getProxy({ configuration, IMAGES });
  const [proxyJson, setProxyJson] = useState<string>(stringify(proxy));
  useEffect(() => {
    setProxyJson(stringify(proxy));
  }, [configuration]);

  if (!edit) {
    return (
      <Button
        style={{ marginTop: "15px", display: "inline-block", float: "right" }}
        onClick={() => setEdit(true)}
      >
        Advanced...
      </Button>
    );
  }

  const save = async () => {
    try {
      setSaving(true);
      setError("");
      const proxy = jsonic(proxyJson);
      setProxyJson(stringify(proxy));
      await setConfig({ proxy });
      if (state == "running") {
        await writeProxy({
          compute_server_id: id,
          project_id,
          proxy,
        });
      }
      setEdit(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={{ marginTop: "15px" }}>
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0" }}
      />
      <Button
        disabled={saving}
        onClick={() => {
          setProxyJson(stringify(proxy));
          setEdit(false);
        }}
        style={{ marginRight: "5px" }}
      >
        <CancelText />
      </Button>
      <Button
        type="primary"
        disabled={saving || proxyJson == stringify(proxy)}
        onClick={save}
      >
        Save {saving && <Spin />}
      </Button>
      <div
        style={{
          display: "inline-block",
          color: "#666",
          marginLeft: "30px",
        }}
      >
        Configure <code>/cocalc/conf/proxy.json</code> using{" "}
        <A href="https://github.com/sagemathinc/cocalc-compute-docker/tree/main/src/proxy">
          this JSON format
        </A>
        .
      </div>
      <Input.TextArea
        style={{ marginTop: "15px" }}
        disabled={saving}
        value={proxyJson}
        onChange={(e) => setProxyJson(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 6 }}
      />
    </div>
  );
}

function stringify(proxy) {
  return "[\n" + proxy.map((x) => "  " + JSON.stringify(x)).join(",\n") + "\n]";
}

async function writeProxy({ proxy, project_id, compute_server_id }) {
  const value = stringify(proxy);
  await writeTextFileToComputeServer({
    value,
    project_id,
    compute_server_id,
    sudo: true,
    path: PROXY_CONFIG,
  });
}

function Apps({
  compute_server_id,
  configuration,
  IMAGES,
  style,
  data,
  project_id,
  state,
}) {
  const [error, setError] = useState<string>("");
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  const apps = useMemo(
    () =>
      getApps({
        setError,
        compute_server_id,
        project_id,
        configuration,
        data,
        IMAGES,
        compute_servers_dns,
        state,
      }),
    [
      configuration?.image,
      IMAGES != null,
      configuration?.proxy,
      data?.externalIp,
    ],
  );
  if (apps.length == 0) {
    return null;
  }
  return (
    <div style={style}>
      <b>Launch App</b> (opens in new browser tab)
      <div>
        <div style={{ marginTop: "5px" }}>{apps}</div>
        <ShowError
          style={{ marginTop: "10px" }}
          error={error}
          setError={setError}
        />
      </div>
    </div>
  );
}

function getApps({
  compute_server_id,
  configuration,
  data,
  IMAGES,
  project_id,
  compute_servers_dns,
  setError,
  state,
}) {
  const image = configuration?.image;
  if (IMAGES == null || image == null) {
    return [];
  }
  const proxy = getProxy({ configuration, IMAGES });
  const apps = IMAGES[image]?.apps ?? IMAGES["defaults"]?.apps ?? {};

  const buttons: React.JSX.Element[] = [];
  for (const name in apps) {
    const app = apps[name];
    if (app.disabled) {
      continue;
    }
    for (const route of proxy) {
      if (route.path == app.path) {
        buttons.push(
          <LauncherButton
            key={name}
            disabled={state != "running"}
            name={name}
            app={app}
            compute_server_id={compute_server_id}
            project_id={project_id}
            configuration={configuration}
            data={data}
            compute_servers_dns={compute_servers_dns}
            setError={setError}
            route={route}
          />,
        );
        break;
      }
    }
  }
  return buttons;
}

export function getRoute({ app, configuration, IMAGES }) {
  const proxy = getProxy({ configuration, IMAGES });
  if (app.name) {
    // It's best and most explicit to use the name.
    for (const route of proxy) {
      if (route.name == app.name) {
        return route;
      }
    }
  }
  // Name is not specified or not matching, so we try to match the
  // route path:
  for (const route of proxy) {
    if (route.path == app.path) {
      return route;
    }
  }
  // nothing matches.
  throw Error(`No route found for app '${app.label}'`);
}

const START_DELAY_MS = 1500;
const MAX_DELAY_MS = 7500;

export function LauncherButton({
  name,
  app,
  compute_server_id,
  project_id,
  configuration,
  data,
  compute_servers_dns,
  setError,
  disabled,
  route,
  noHide,
  autoLaunch,
}: {
  name: string;
  app;
  compute_server_id: number;
  project_id: string;
  configuration;
  data;
  compute_servers_dns?: string;
  setError;
  disabled?;
  route;
  noHide?: boolean;
  autoLaunch?: boolean;
}) {
  const [url, setUrl] = useState<string>("");
  const [launching, setLaunching] = useState<boolean>(false);
  const [log, setLog] = useState<string>("");
  const cancelRef = useRef<boolean>(false);
  const [start, setStart] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const dnsIssue =
    !(configuration?.dns && compute_servers_dns) && app.requiresDns;
  useEffect(() => {
    if (autoLaunch) {
      launch();
    }
  }, []);
  const launch = async () => {
    try {
      setLaunching(true);
      cancelRef.current = false;
      const url = getUrl({
        app,
        configuration,
        data,
        compute_servers_dns,
      });
      setUrl(url);
      let attempt = 0;
      setStart(new Date());
      const isRunning = async () => {
        attempt += 1;
        setLog(`Checking if ${route.target} is alive (attempt: ${attempt})...`);
        return await isHttpServerResponding({
          project_id,
          compute_server_id,
          target: route.target,
        });
      };
      if (!(await isRunning())) {
        setLog("Launching...");
        await webapp_client.exec({
          filesystem: false,
          compute_server_id,
          project_id,
          command: app.launch,
          err_on_exit: true,
        });
      }
      let d = START_DELAY_MS;
      while (!cancelRef.current && d < 60 * 1000 * 5) {
        if (await isRunning()) {
          setLog("Running!");
          break;
        }
        d = Math.min(MAX_DELAY_MS, d * 1.2);
        await delay(d);
      }
      if (!cancelRef.current) {
        setLog("Opening tab");
        open_new_tab(url);
      }
    } catch (err) {
      setError(`${app.label}: ${err}`);
    } finally {
      setLaunching(false);
      setLog("");
    }
  };
  return (
    <div key={name} style={{ display: "inline-block", marginRight: "5px" }}>
      <Button disabled={disabled || dnsIssue || launching} onClick={launch}>
        {app.icon ? <Icon name={app.icon} /> : undefined}
        {app.label}{" "}
        {dnsIssue && <span style={{ marginLeft: "5px" }}>(requires DNS)</span>}
        {launching && <Spin />}
      </Button>
      {launching && (
        <Button
          style={{ marginLeft: "5px" }}
          onClick={() => {
            cancelRef.current = true;
            setLaunching(false);
            setUrl("");
          }}
        >
          <CancelText />
        </Button>
      )}
      {log && (
        <div>
          {log}
          <TimeAgo date={start} />
        </div>
      )}
      {url && (
        <div
          style={{
            color: "#666",
            maxWidth: "500px",
            border: "1px solid #ccc",
            padding: "15px",
            borderRadius: "5px",
            margin: "10px 0",
          }}
        >
          It could take a minute for {app.label} to start, so revisit this URL
          if necessary.
          {dnsIssue && (
            <Alert
              style={{ margin: "10px" }}
              type="warning"
              showIcon
              message={
                <>
                  <b>WARNING:</b> {app.label} probably won't work without a DNS
                  subdomain configured.
                  <Button
                    style={{ marginLeft: "15px" }}
                    onClick={() => {
                      setShowSettings(true);
                    }}
                  >
                    <Icon name="settings" /> Settings
                  </Button>
                  {showSettings && (
                    <EditModal
                      id={compute_server_id}
                      project_id={project_id}
                      close={() => setShowSettings(false)}
                    />
                  )}
                </>
              }
            />
          )}
          <div style={{ textAlign: "center" }}>
            <A href={url}>{url}</A>
          </div>
          You can also share this URL with other people, who will be able to
          access the server, even if they do not have a CoCalc account.
          {!noHide && (
            <Button size="small" type="link" onClick={() => setUrl("")}>
              (hide)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function getUrl({ app, configuration, data, compute_servers_dns }) {
  const auth = getQuery(configuration.authToken);
  if (configuration.dns && compute_servers_dns) {
    return `https://${configuration.dns}.${compute_servers_dns}${app.url}${auth}`;
  } else {
    if (!data?.externalIp) {
      throw Error("no external ip addressed assigned");
    }
    return `https://${data.externalIp}${app.url}${auth}`;
  }
}

// Returns true if there is an http server responding at http://localhost:port on the
// given compute server.
async function isHttpServerResponding({
  project_id,
  compute_server_id,
  target,
  maxTimeS = 5,
}) {
  const command = `curl --silent --fail --max-time ${maxTimeS} ${target} >/dev/null; echo $?`;
  const { stdout } = await webapp_client.exec({
    filesystem: false,
    compute_server_id,
    project_id,
    command,
    err_on_exit: false,
  });
  return stdout.trim() == "0";
}
