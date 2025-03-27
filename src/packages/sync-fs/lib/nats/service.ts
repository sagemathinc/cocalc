/*
SyncFS Client Service
*/

import { createSyncFsClientService } from "@cocalc/nats/service/syncfs-client";
import { type SyncFS } from "../index";

export async function initNatsService({
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
  };
  return await createSyncFsClientService({
    compute_server_id,
    project_id,
    impl,
  });
}
