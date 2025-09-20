/*
Fileserver with all safety off for the project.    This is run inside the project by the project,
so the security is off.
*/

import { localPathFileserver } from "@cocalc/backend/conat/files/local-path";
import { getService } from "@cocalc/conat/files/fs";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { connectToConat } from "@cocalc/project/conat/connection";

let server: any = undefined;
export async function init() {
  if (server) {
    return;
  }
  const client = connectToConat();
  const service = getService({ compute_server_id });
  server = await localPathFileserver({
    client,
    service,
    path: process.env.HOME ?? "/tmp",
    unsafeMode: true,
    project_id,
  });
}

export function close() {
  server?.close();
  server = undefined;
}
