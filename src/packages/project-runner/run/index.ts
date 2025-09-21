/*
Project run server.

DEV -- see packages/server/conat/project/run.ts

*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/backend/conat";
import { server as projectRunnerServer } from "@cocalc/conat/project/runner/run";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { init as initFilesystem, localPath, sshServers } from "./filesystem";
import getLogger from "@cocalc/backend/logger";
import { start, stop, status } from "./podman";

const logger = getLogger("project-runner:run");

let client: ConatClient | null = null;
export async function init(
  opts: { id?: string; client?: ConatClient; localPath?; sshServers? } = {},
) {
  logger.debug("init");
  client = opts.client ?? conat();
  initFilesystem({ client });
  return await projectRunnerServer({
    client,
    start: reuseInFlight(start),
    stop: reuseInFlight(stop),
    status: reuseInFlight(status),
    localPath: opts.localPath ?? localPath,
    sshServers: opts.sshServers ?? sshServers,
  });
}
