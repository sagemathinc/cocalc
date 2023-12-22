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
            <Icon name="disk-snapshot" /> Ephemeral Disk
          </b>
        </div>
        {help && (
          <Alert
            showIcon
            style={{ margin: "15px 0" }}
            type="info"
            message={"Ephemeral Local Disk for the Compute Server"}
            description={
              <div>
                <p>
                  If you will use this server only for{" "}
                  <i>temporary computations</i> and want{" "}
                  <i>maximum flexibility and minimal cost</i>, make its local
                  disk ephemeral. This setting only modifies the user interface:
                  the default way to "turn off" the server will delete its disk.
                </p>
                <p>
                  Do you plan to use data on this compute server that you want
                  to preserve? The HOME directory is sync'd, except hidden
                  folders and directories explicitly excluded above. Other
                  files, e.g., in /tmp and systemwide changes, exist only on the
                  compute server's local disk{" "}
                  <i>without any automatic backups</i>. (Backup functionality
                  for local data will be implementd in the future.)
                </p>
                <p>
                  If you don't need to preserve data that are not sync'd,
                  ephemeral disk is likely to be convenient.
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
          Discard local disk and data by default to avoid paying for storage
        </Checkbox>
      </div>
    </div>
  );
}
