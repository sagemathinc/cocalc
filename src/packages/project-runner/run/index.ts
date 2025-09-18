/*
Project run server.

DEV -- see packages/server/conat/project/run.ts

*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/backend/conat";
import { server as projectRunnerServer } from "@cocalc/conat/project/runner/run";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { type Configuration } from "./types";
export { type Configuration };
import { init as initFilesystem, localPath, sshServer } from "./filesystem";
import getLogger from "@cocalc/backend/logger";
import { start, stop, status, close } from "./podman";
export { close };
import { init as initMounts } from "./mounts";

const logger = getLogger("project-runner:run");

let client: ConatClient | null = null;
export async function init(
  opts: { client?: ConatClient; localPath?; sshServer? } = {},
) {
  logger.debug("init");
  client = opts.client ?? conat();
  initFilesystem({ client });
  await initMounts();
  return await projectRunnerServer({
    client,
    start: reuseInFlight(start),
    stop: reuseInFlight(stop),
    status: reuseInFlight(status),
    localPath: opts.localPath ?? localPath,
    sshServer: opts.sshServer ?? sshServer,
  });
}
