/*
Project runner load balancer

There should be exactly one of these running, and it needs access to the database
of course. It decides where to run projects and proxied the actual requests.
*/

import { conat } from "@cocalc/backend/conat";
import { server as loadBalancer } from "@cocalc/conat/project/runner/load-balancer";
import { loadConatConfiguration } from "../configuration";
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getProject } from "@cocalc/server/projects/control";
import { type Configuration } from "@cocalc/conat/project/runner/types";
import { getProjectSecretToken } from "@cocalc/server/projects/control/secret-token";

const logger = getLogger("server:conat:project:load-balancer");

const DEFAULT_PID_LIMIT = 4096;

let server;
export async function init() {
  logger.debug("init");
  await loadConatConfiguration();
  server = await loadBalancer({
    client: conat(),
    setState: setProjectState,
    getConfig,
  });
  logger.debug("running");
}

export function close() {
  logger.debug("close");
  server?.close();
}

async function getConfig({ project_id }): Promise<Configuration> {
  const project = getProject(project_id);
  await project.computeQuota();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT run_quota, rootfs_image as image FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (rows.length == 0) {
    throw Error(`no project ${project_id}`);
  }
  const { run_quota, image } = rows[0];
  const config = {
    image,
    secret: await getProjectSecretToken(project_id),
    cpu: `${(run_quota?.cpu_limit ?? 1) * 1000}m`,
    memory: `${run_quota?.memory_limit ?? 1000}M`,
    pids: DEFAULT_PID_LIMIT,
    swap: "16Gi", // no clue,
    disk: `${run_quota?.disk_quota ?? 1000}M`,
  } as Configuration;

  logger.debug("config", { project_id, run_quota, config });

  return config;
}

async function setProjectState({ project_id, state }) {
  try {
    const p = await getProject(project_id);
    await p.saveStateToDatabase({ state });
  } catch {}
}
