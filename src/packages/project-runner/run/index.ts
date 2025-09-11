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
import { init as initFilesystem } from "./filesystem";
import getLogger from "@cocalc/backend/logger";
import * as nsjail from "./nsjail";
import * as podman from "./podman";
import { init as initMounts } from "./mounts";

const logger = getLogger("project-runner:run");

let client: ConatClient | null = null;
export async function init(
  opts: { client?: ConatClient; runtime?: "nsjail" | "podman" } = {},
) {
  const runtimeName = opts.runtime ?? "podman";
  logger.debug("init", runtimeName);
  let runtime;
  switch (runtimeName) {
    case "nsjail":
      runtime = nsjail;
      break;
    case "podman":
      runtime = podman;
      break;
    default:
      throw Error(`runtime '${runtimeName}' not implemented`);
  }
  client = opts.client ?? conat();
  initFilesystem({ client });
  await initMounts();

  const { start, stop, status } = runtime;
  return await projectRunnerServer({
    client,
    start: reuseInFlight(start),
    stop: reuseInFlight(stop),
    status: reuseInFlight(status),
  });
}

export function close() {
  nsjail.close();
}
