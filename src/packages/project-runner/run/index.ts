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
import { init as initSidecar, save } from "./sidecar";

const logger = getLogger("project-runner:run");

let client: ConatClient | null = null;
export async function init(
  opts: { id?: string; client?: ConatClient; localPath?; sshServers? } = {},
) {
  logger.debug("init");
  const id = opts.id ?? process.env.PROJECT_RUNNER_NAME;
  if (!id) {
    throw Error("you must set the PROJECT_RUNNER_NAME env variable or the id");
  }
  client = opts.client ?? conat();
  initFilesystem({ client });
  // make sure the sidecar container image is built and available (it's small and should take a few seconds)
  await initSidecar();
  return await projectRunnerServer({
    id,
    client,
    start: reuseInFlight(start),
    stop: reuseInFlight(stop),
    status: reuseInFlight(status),
    save: reuseInFlight(save),
    move: async () => {
      throw new Error("project move is not implemented yet");
    },
    localPath: opts.localPath ?? localPath,
    sshServers: opts.sshServers ?? sshServers,
  });
}
