import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Select, Tooltip } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components";

interface Props {
  setConfig;
  configuration: Configuration;
  disabled?: boolean;
  state?: State;
  style?: CSSProperties;
}

export default function ExcludeFromSync({
  setConfig,
  configuration,
  disabled,
  state = "deprovisioned",
  style,
}: Props) {
  const [value, setValue] = useState<readonly string[] | undefined>(
    configuration.excludeFromSync,
  );
  useEffect(() => {
    setValue(configuration.excludeFromSync);
  }, [configuration.excludeFromSync]);
  return (
    <div style={style}>
      <Tooltip
        title={
          <>
            List of subdirectories of HOME to exclude from sync. Files you
            change or create on the compute server in these directories will not
            be saved back to the project when you click the Sync button. Disk IO
            in these directories is{" "}
            <b>
              <i>VERY fast</i>
            </b>
            , and you can use all available disk space. NOTE: Top level hidden
            folders are always excluded from sync.
          </>
        }
      >
        <b>
          <Icon name="bolt" /> Fast Data Directories:
        </b>{" "}
        The HOME directory of the project is mounted over the network and can be{" "}
        <b>very slow</b>. List here top level subdirectories of HOME that you do
        not want to <b>be mounted over the network</b>. Files in these
        directories are stored in <code>/data</code> on the compute server's
        disk only, which is <b>very fast</b>.
      </Tooltip>
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
        style={{ width: "100%", marginTop: "5px" }}
        placeholder="Type a directory name then hit enter..."
        onChange={(value) => {
          setValue(value);
          setConfig({ excludeFromSync: value ?? [] });
        }}
      />
      <div style={{ marginTop: "10px" }}>
        <b>WARNING:</b> Files that are only on compute servers are not backed up
        by CoCalc.
      </div>
    </div>
  );
}
