/*
This is a service that runs in the home base (or file server) to provide the home directory filesystem.
*/

import { createServiceClient, createServiceHandler } from "./typed";

interface SyncFsServerApi {
  // nothing yet!
}

export function syncFsServerClient({
  project_id,
  timeout,
}: {
  project_id: string;
  timeout?: number;
}) {
  return createServiceClient<SyncFsServerApi>({
    project_id,
    service: "syncfs-server",
    timeout,
  });
}

export async function createSyncFsServerService({
  project_id,
  impl,
}: {
  project_id: string;
  impl: SyncFsServerApi;
}) {
  return await createServiceHandler<SyncFsServerApi>({
    project_id,
    service: "syncfs-server",
    description:
      "SyncFs server service that runs in the home base or file server",
    impl,
  });
}
