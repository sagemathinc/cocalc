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
            List of top level subdirectories to exclude from sync. Files you
            change or create on the compute server in these directories will not
            be saved back to the project. Disk IO in these directories is VERY
            fast, and you can use all available space. NOTE: Top level hidden
            folders are never synced.
          </>
        }
      >
        <b>
          <Icon name="bolt" /> Fast Local Data Directories:
        </b>{" "}
        The following subdirectories of the HOME directory on the compute server
        will <b>not</b> be synchronized with the project's HOME directory. They
        are stored in <code>/data</code> only on the compute server.
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
        placeholder="Directories to Exclude from Sync..."
        onChange={(value) => {
          setValue(value);
          setConfig({ excludeFromSync: value ?? [] });
        }}
      />
      <div style={{ marginTop: "10px" }}>
        <b>WARNING:</b> Files that are only on compute servers are not
        automatically backed up in any way.
      </div>
    </div>
  );
}
