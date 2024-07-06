import { useState, useEffect } from "react";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { getCloudFilesystems } from "./api";

// This uses potentially 30 second stale cached data if available, doesn't update automatically.
// We should improve that later, probably switching a changefeed like with compute servers, etc.
// But for v0 this is fine.
export function useCloudFilesystem({
  cloud_filesystem_id,
  refresh,
}: {
  cloud_filesystem_id: number;
  refresh?: number;
}): [CloudFilesystem | null, string, (string) => void] {
  const [filsystem, setFilesystem] = useState<CloudFilesystem | null>(null);
  const [error, setError] = useState<string>("");
  useEffect(() => {
    (async () => {
      let v;
      try {
        setError("");
        v = await getCloudFilesystems({
          id: cloud_filesystem_id,
          cache: true,
        });
      } catch (err) {
        setError(`${err}`);
        return;
      }
      if (v.length != 1) {
        setError(`no cloud file system with global id ${cloud_filesystem_id}`);
      } else {
        setFilesystem(v[0]);
      }
    })();
  }, [refresh]);
  return [filsystem, error, setError];
}
