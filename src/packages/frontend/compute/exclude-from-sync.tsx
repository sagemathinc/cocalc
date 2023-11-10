import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Select, Tooltip } from "antd";
import { CSSProperties, useEffect, useState } from "react";

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
      <Tooltip title="List of top level subdirectories of the project's home directory to exclude from sync. Files you change or create on the compute server in these directories will not be saved back to the project.  Top level hidden folders are never synced.  Include '~' to completely disable sync.">
        Directories to Exclude from Sync:
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
    </div>
  );
}
