/*
The HTTPS proxy server.
*/

import { Alert, Button, Input, Spin, Switch } from "antd";
import { useState } from "react";
import { A, Icon } from "@cocalc/frontend/components";
import AuthToken from "./auth-token";
import ShowError from "@cocalc/frontend/components/error";
import { PROXY_CONFIG } from "@cocalc/util/compute/constants";
import { writeTextFileToComputeServer } from "./util";
import jsonic from "jsonic";

export default function Proxy({
  id,
  project_id,
  setConfig,
  configuration,
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
            <Icon name="global" /> Hosted Web Servers
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
                Pluto on your compute server. The authorization token is used to
                securely access these servers.
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
        />
        <AuthToken
          id={id}
          project_id={project_id}
          setConfig={setConfig}
          configuration={configuration}
          state={state}
          IMAGES={IMAGES}
        />
      </div>
    </div>
  );
}

function ProxyConfig({ id, project_id, setConfig, configuration, state }) {
  const [edit, setEdit] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const proxy = configuration?.proxy ?? [];
  const [proxyJson, setProxyJson] = useState<string>(stringify(proxy));

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
        onClick={() => setEdit(false)}
        style={{ marginRight: "5px" }}
      >
        Close
      </Button>
      <Button disabled={saving || proxyJson == stringify(proxy)} onClick={save}>
        Save {saving && <Spin />}
      </Button>
      <div
        style={{
          display: "inline-block",
          color: "#666",
          marginLeft: "30px",
        }}
      >
        Configure proxy using{" "}
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
