/*
SyncFS Client Service, which runs on compute servers
*/

import { createSyncFsClientService } from "@cocalc/conat/service/syncfs-client";
import { type SyncFS } from "../index";

export async function initNatsClientService({
  syncfs,
  compute_server_id,
  project_id,
}: {
  syncfs: SyncFS;
  compute_server_id: number;
  project_id: string;
}) {
  // sanity check
  if (!compute_server_id) {
    throw Error("compute_server_id must be a positive integer");
  }
  const impl = {
    sync: async () => {
      await syncfs.sync();
    },

    copyFilesToHomeBase: async (opts: { paths: string[]; dest?: string }) => {
      await syncfs.doApiRequest({
        ...opts,
        event: "copy_from_compute_server_to_project",
      });
    },

    copyFilesFromHomeBase: async (opts: { paths: string[]; dest?: string }) => {
      await syncfs.doApiRequest({
        ...opts,
        event: "copy_from_project_to_compute_server",
      });
    },
  };
  return await createSyncFsClientService({
    compute_server_id,
    project_id,
    impl,
  });
}
