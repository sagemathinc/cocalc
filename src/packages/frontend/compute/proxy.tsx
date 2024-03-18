/*
The HTTPS proxy server.
*/

import { Alert, Switch } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import AuthToken from "./auth-token";

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
