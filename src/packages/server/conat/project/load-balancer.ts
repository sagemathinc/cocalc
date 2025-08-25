/*
Project run server load balancer
*/

import { conat } from "@cocalc/backend/conat";
import { server as loadBalancer } from "@cocalc/conat/project/runner/load-balancer";
import { loadConatConfiguration } from "../configuration";
import getLogger from "@cocalc/backend/logger";
import { setProjectState } from "./run";
import getPool from "@cocalc/database/pool";
import { getProject } from "@cocalc/server/projects/control";
import { type Configuration } from "./types";

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
    "SELECT settings, run_quota FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (rows.length == 0) {
    throw Error(`no project ${project_id}`);
  }
  const { settings, run_quota } = rows[0];
  const config = {} as Configuration;
  if (settings?.admin || run_quota?.privileged) {
    config.admin = true;
  }
  config.cpu = `${(run_quota?.cpu_limit ?? 1) * 1000}m`;
  config.memory = `${run_quota?.memory ?? 1000}M`;
  config.pids = DEFAULT_PID_LIMIT;
  config.swap = "16Gi"; // no clue
  config.disk = `${run_quota?.disk_quota ?? 1000}M`;

  logger.debug("config", { project_id, run_quota, config });

  return config;
}
