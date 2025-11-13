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
      message={<>Compute Servers</>}
      description={
        <>
          You can also easily use a dedicated server where you have full admin
          root permissions and nearly unlimited resources. These are charged by
          the second and have up to{" "}
          <strong>
            416 vCPUs, 65TB of disk space, 11TB of RAM and high end GPUs
            including 8x NVIDIA H100s.{" "}
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
