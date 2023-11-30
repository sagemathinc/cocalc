/*
An alert that points users at the existence of compute servers.
*/

import { computeServersEnabled } from "@cocalc/frontend/compute";
import { Alert, Button } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { redux } from "@cocalc/frontend/app-framework";

export default function ComputeServersAlert({ project_id }) {
  if (!computeServersEnabled()) {
    return null;
  }
  return (
    <Alert
      style={{ margin: "15px 0" }}
      type="success"
      showIcon
      icon={<Icon name="servers" />}
      message=<>Dedicated Compute Servers</>
      description={
        <>
          You can also run Jupyter notebooks, terminals, and commercial software
          on dedicated VM's where you have root permissions. These are charged
          by the second and have up to{" "}
          <strong>
            11,776GB of RAM, 416 vCPU's, 65TB of disk space, and GPU's.{" "}
          </strong>
          <br />
          Click the{" "}
          <Button
            onClick={() => {
              redux.getProjectActions(project_id).set_active_tab("servers", {
                change_history: true,
              });
            }}
          >
            <Icon name="server" /> Servers
          </Button>{" "}
          button to get started.
        </>
      }
    />
  );
}
