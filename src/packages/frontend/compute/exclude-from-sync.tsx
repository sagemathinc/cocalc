import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Alert, Select, Switch } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components";

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
          <Icon name="bolt" /> Fast Data Directories
        </b>
      </div>
      {help && (
        <Alert
          showIcon
          style={{ margin: "15px 0" }}
          type="info"
          message={"Fast Data Directories"}
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
                many terabytes). NOTE: Top level hidden folders are always
                excluded from sync.
              </p>
              <p>
                The HOME directory of the project is mounted over the network
                and can be <b>very slow</b>. List top level subdirectories of
                HOME that you do not want to <b>be mounted over the network</b>.
                Files in these directories are stored in <code>/data</code> on
                the compute server's disk only, which is <b>very fast</b>.
              </p>
              <p>
                If you include <code>~</code> or <code>.</code> in the list
                below, then the sync process is temporarily disabled, though
                your HOME directory is still mounted over the network.
                {id == null && (
                  <>
                    {" "}
                    The directory <code>compute-server-[id]</code> is included
                    by default, and <code>[id]</code> in any path is replaced by
                    the numerical id of the compute server.
                  </>
                )}
              </p>
              <p>
                You can efficiently copy files and directories back and forth
                between your project and a compute server using the Explorer.
              </p>
            </div>
          }
        />
      )}
      <div style={{ color: "#666" }}>
        Subdirectories of HOME to exclude from sync.
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
      <div style={{ marginTop: "10px", color: "#666" }}>
        <b>WARNING:</b> Files that are only on compute servers are not backed up
        in any way by CoCalc.
      </div>
    </div>
  );
}
