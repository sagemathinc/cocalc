import { Alert, Checkbox, Switch } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Ephemeral({ setConfig, configuration, loading }) {
  const [ephemeral, setEphemeral] = useState<boolean>(configuration.ephemeral);
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
            <Icon name="disk-snapshot" /> Ephemeral Data
          </b>
        </div>
        {help && (
          <Alert
            showIcon
            style={{ margin: "15px 0" }}
            type="info"
            message={"Ephemeral Compute Server"}
            description={
              <div>
                <p>
                  Make your compute server "ephemeral" if you are only using the
                  compute server for <i>temporary compute</i>, and do not want
                  to store data on this compute server between sessions.
                </p>
                <p>
                  Do you plan to store data on this compute server that you
                  don't want to delete? The HOME directory is sync'd, except
                  hidden folders and directories to exclude from sync (listed
                  above). Other files, e.g., in /tmp and systemwide changes,
                  exist only on the compute server's disk. If you select
                  "ephemeral" below, the disk of this server will be deleted by
                  default when you turn it off, so that you are not charged for
                  storage space.
                </p>
                <p>
                  <b>WARNING:</b> Files that are only on compute servers are NOT
                  backed up, except files sync'd to the project HOME directory.
                  You are responsible for making backups yourself. Backup
                  functionality will be implementd in the future.
                </p>
              </div>
            }
          />
        )}
        <Checkbox
          style={{ marginTop: "5px" }}
          disabled={loading}
          checked={ephemeral}
          onChange={() => {
            setConfig({ ephemeral: !ephemeral });
            setEphemeral(!ephemeral);
          }}
        >
          Ephemeral: I do not want to store data on this compute server between
          sessions
        </Checkbox>
      </div>
    </div>
  );
}
