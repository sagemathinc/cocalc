/*
This is a service that runs in the home base (or file server) to provide the home directory filesystem.
*/

import { createServiceClient, createServiceHandler } from "./typed";

interface SyncFsServerApi {
  // nothing yet!
}

export function SyncFsClient({ compute_server_id, project_id }) {
  return createServiceClient<SyncFsServerApi>({
    project_id,
    compute_server_id,
    service: "syncfs-server",
  });
}

export async function createSyncFsServerService({
  compute_server_id,
  project_id,
  impl,
}: {
  project_id: string;
  compute_server_id: number;
  impl: SyncFsServerApi;
}) {
  return await createServiceHandler<SyncFsServerApi>({
    project_id,
    compute_server_id,
    service: "syncfs-server",
    description:
      "SyncFs server service that runs in the home base or file server",
    impl,
  });
}
