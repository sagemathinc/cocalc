/*
This is a *service* that runs in the filesystem part of a compute server.

It's called "syncfs-client" because it runs on the client part of the filesystem
that compute servers use.
*/

import { createServiceClient, createServiceHandler } from "./typed";

interface SyncFsApiClient {
  // cause the compute server to initiate a sync asap.
  sync: () => Promise<void>;
}

export function syncFsClient({ compute_server_id, project_id }) {
  return createServiceClient<SyncFsApiClient>({
    project_id,
    compute_server_id,
    service: "syncfs-client",
  });
}

export async function createSyncFsClientService({
  compute_server_id,
  project_id,
  impl,
}: {
  project_id: string;
  compute_server_id: number;
  impl: SyncFsApiClient;
}) {
  return await createServiceHandler<SyncFsApiClient>({
    project_id,
    compute_server_id,
    service: "syncfs-client",
    description: "SyncFs client service that runs on each compute server.",
    impl,
  });
}
