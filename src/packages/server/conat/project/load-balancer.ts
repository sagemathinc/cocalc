/*
Project run server load balancer
*/

import { conat } from "@cocalc/backend/conat";
import { server as loadBalancer } from "@cocalc/conat/project/runner/load-balancer";
import { loadConatConfiguration } from "../configuration";
import getLogger from "@cocalc/backend/logger";
import { setProjectState } from "./run";
import getPool from "@cocalc/database/pool";

const logger = getLogger("server:conat:project:load-balancer");

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

async function getConfig({ project_id }) {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT settings FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (rows[0]?.settings?.admin) {
    return { admin: true, disk: "25G" };
  } else {
    // some defaults, mainly for testing
    return {
      cpu: "1000m",
      memory: "8Gi",
      pids: 10000,
      swap: "5000Gi",
      disk: "1G",
    };
  }
}
