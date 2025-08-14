/*
Hook for getting a FilesystemClient.
*/
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { useMemo } from "react";

// this will probably get more complicated temporarily when we
// are transitioning between filesystems (hence why we return null in
// the typing for now)
export default function useFs({
  project_id,
  compute_server_id,
  computeServerId,
}: {
  project_id: string;
  compute_server_id?: number;
  computeServerId?: number;
}): FilesystemClient | null {
  return useMemo<FilesystemClient>(
    () =>
      webapp_client.conat_client.conat().fs({
        project_id,
        compute_server_id: compute_server_id ?? computeServerId,
      }),
    [project_id, compute_server_id, computeServerId],
  );
}
