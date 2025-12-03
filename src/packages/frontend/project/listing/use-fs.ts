/*
Hook for getting a FilesystemClient.
*/
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { useMemo } from "react";
import { getProjectHostAddress } from "@cocalc/frontend/project_actions";

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
  const address = getProjectHostAddress(project_id);
  return useMemo<FilesystemClient | null>(() => {
    if (!address) return null;
    return webapp_client.conat_client.conat({ address }).fs({
      project_id,
      compute_server_id: compute_server_id ?? computeServerId,
    });
  }, [project_id, compute_server_id, computeServerId, address]);
}
