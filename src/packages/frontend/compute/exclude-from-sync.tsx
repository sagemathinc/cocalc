import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Alert, Select, Switch } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { DEFAULT_FAST_LOCAL } from "./create-compute-server";

interface Props {
  setConfig;
  configuration: Configuration;
  disabled?: boolean;
  state?: State;
  style?: CSSProperties;
  id?: number;
}

export default function ExcludeFromSync({
  setConfig,
  configuration,
  disabled,
  state = "deprovisioned",
  style,
  id,
}: Props) {
  const [help, setHelp] = useState<boolean>(false);
  const [value, setValue] = useState<readonly string[] | undefined>(
    configuration.excludeFromSync,
  );
  useEffect(() => {
    setValue(configuration.excludeFromSync);
  }, [configuration.excludeFromSync]);

  return (
    <div style={style}>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>
          <Switch
            size="small"
            checkedChildren={"Help"}
            unCheckedChildren={"Help"}
            style={{ float: "right" }}
            checked={help}
            onChange={(val) => setHelp(val)}
          />
          <Icon name="bolt" /> Fast Local Directories
        </b>
      </div>
      {help && (
        <Alert
          showIcon
          style={{ margin: "15px 0" }}
          type="info"
          message={"Fast Local Directories"}
          description={
            <div>
              <p>
                Files you change or create on the compute server in these
                directories will not be saved back to the project when you click
                the Sync button or Save a file. Disk IO in these directories is{" "}
                <b>
                  <i>VERY fast</i>
                </b>
                , and you can use all available compute server disk space (up to
                many terabytes).
              </p>
              <p>
                The HOME directory of the project is mounted over the network
                and can be very slow. List top level subdirectories of HOME that
                you do not want to be syned over the network. Files in these
                directories are stored in <code>/data</code> on the compute
                server's disk only, which is extremely fast.
                <b>
                  Fast local directories are NOT backed up, but do persist until
                  the compute server is deleted or deprovisioned.
                </b>
              </p>
              <p>
                If you include <code>~</code> or <code>.</code> in the list
                below, then the sync process is temporarily disabled, though
                your HOME directory is still mounted over the network.
                {id == null && (
                  <>
                    The directory <code>{DEFAULT_FAST_LOCAL}</code> is a fast
                    local directory by default. (You can also use
                    <code>[id]</code> in the path, and it will be replaced by
                    the numerical id of the compute server.) You can add and
                    remove any other fast local subdirectories of HOME.
                  </>
                )}
              </p>
              <p>
                You can efficiently copy files and directories back and forth
                between your shared HOME directory and a compute server using
                the File Explorer.
              </p>
            </div>
          }
        />
      )}
      <div style={{ color: "#666" }}>
        Fast local directories exist only on the compute server and{" "}
        <b>are NOT backed up in any way</b>. They persist until the compute
        server is deleted or deprovisioned.
      </div>
      <Select
        value={value}
        disabled={
          disabled ||
          state == "running" ||
          state == "suspended" ||
          state == "suspending"
        }
        tokenSeparators={["/", " ", "|"]}
        mode="tags"
        style={{ width: "100%", marginTop: "10px" }}
        placeholder="Type a directory name then hit enter..."
        onChange={(value) => {
          setValue(value);
          setConfig({ excludeFromSync: value ?? [] });
        }}
      />
    </div>
  );
}
