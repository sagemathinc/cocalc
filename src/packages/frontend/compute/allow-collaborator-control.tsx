import { Alert, Checkbox, Switch } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function AllowCollaboratorControl({
  setConfig,
  configuration,
  loading,
}) {
  const [allowCollaboratorControl, setAllowCollaboratorControl] =
    useState<boolean>(!!configuration.allowCollaboratorControl);
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
            <Icon name="users" /> Allow Collaborator Control
          </b>
        </div>
        {help && (
          <Alert
            showIcon
            style={{ margin: "15px 0" }}
            type="info"
            message={"Allow Collaborators to Control this Compute Server"}
            description={
              <div>
                Any collaborator on this project will be allowed to start, stop,
                suspend or resume this compute server. You will be charged for
                usage (not them).
              </div>
            }
          />
        )}
        <Checkbox
          style={{ marginTop: "5px" }}
          disabled={loading}
          checked={allowCollaboratorControl}
          onChange={() => {
            setConfig({ allowCollaboratorControl: !allowCollaboratorControl });
            setAllowCollaboratorControl(!allowCollaboratorControl);
          }}
        >
          Allow Collaborator Control: allow project collaborators to start,
          stop, suspend and resume this compute server (you pay)
        </Checkbox>
      </div>
    </div>
  );
}
