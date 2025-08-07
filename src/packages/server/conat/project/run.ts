/*
Project run server.

It may be necessary to do this to enable the user running this
code to use nsjail:

    sudo sysctl -w kernel.apparmor_restrict_unprivileged_unconfined=0 && sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0

See https://github.com/google/nsjail/issues/236#issuecomment-2267096267
*/

import { conat } from "@cocalc/backend/conat";
import { server as projectRunnerServer } from "@cocalc/conat/project/runner/run";
import { isValidUUID } from "@cocalc/util/misc";
import { getProject } from "@cocalc/server/projects/control";
import { loadConatConfiguration } from "../configuration";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
// import { homePath } from "@cocalc/server/projects/control/util";

const logger = getLogger("server:conat:project:run");

let servers: any[] = [];

const children: { [project_id: string]: any } = {};

async function setProjectState(project_id, state) {
  try {
    const p = await getProject(project_id);
    await p.saveStateToDatabase({ state });
  } catch {}
}

async function start({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("start: project_id must be valid");
  }
  logger.debug("start", { project_id });
  setProjectState(project_id, "starting");
  if (children[project_id] != null && children[project_id].exitCode == null) {
    logger.debug("start -- already running");
    return;
  }
  const p = await getProject(project_id);
  // @ts-ignore
  const child = await p.start(true);
  children[project_id] = child;
  setProjectState(project_id, "running");
}

async function stop({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("stop: project_id must be valid");
  }
  logger.debug("stop", { project_id });
  if (children[project_id] != null && children[project_id].exitCode == null) {
    setProjectState(project_id, "stopping");
    children[project_id]?.kill("SIGKILL");
    delete children[project_id];
  }
  setProjectState(project_id, "opened");
}

async function status({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("status: project_id must be valid");
  }
  logger.debug("status", { project_id });
  let state;
  if (children[project_id] == null || children[project_id].exitCode) {
    state = "opened";
  } else {
    state = "running";
  }
  setProjectState(project_id, state);
  return { state };
}

export async function init(count: number = 1) {
  await loadConatConfiguration();
  for (let i = 0; i < count; i++) {
    const server = await projectRunnerServer({
      client: conat(),
      start: reuseInFlight(start),
      stop: reuseInFlight(stop),
      status: reuseInFlight(status),
    });
    servers.push(server);
  }
}

export function close() {
  for (const server of servers) {
    server.close();
  }
  servers.length = 0;
}
