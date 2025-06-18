/*
Manage health check of compute servers... if it is explicitly enabled by the user.

Call this function to do the next round of health checks.  Ideally this function
gets called once every minute.  The state of health checks.

NOTE: the interval and the number of failures is stored in memory, NOT the database,
so gets reset when this service gets restarted.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import callProject from "@cocalc/server/projects/call";
import {
  deprovision,
  suspend,
  stop,
  reboot,
} from "@cocalc/server/compute/control";
import { uuid } from "@cocalc/util/misc";
import type { ComputeServerEventLogEntry } from "@cocalc/util/compute/log";
import {
  validatedHealthCheck,
  type HealthCheck,
  HEALTH_CHECK_DEFAULTS,
} from "@cocalc/util/db-schema/compute-servers";
import { map } from "awaiting";

const PARALLEL_LIMIT = 10;

const logger = getLogger("server:compute:maintenance:cloud:health-check");

export default async function automaticShutdown() {
  try {
    await update();
  } catch (err) {
    logger.debug("WARNING - issue running automatic shutdown update loop", err);
  }
}

const lastHealthCheck: { [id: number]: number } = {};
const numFailures: { [id: number]: number } = {};

async function update() {
  const pool = getPool();
  const query = `
WITH servers AS (
  SELECT
    id,
    account_id,
    project_id,
    state_changed,
    configuration#>'{healthCheck}' AS health_check
  FROM compute_servers
  WHERE state = 'running'
    AND cloud != 'running'
    AND (configuration#>'{healthCheck}') IS NOT NULL
    AND state_changed IS NOT NULL
    AND state_changed <= NOW() - coalesce((configuration#>'{healthCheck,initialDelaySeconds}')::real, ${HEALTH_CHECK_DEFAULTS.initialDelaySeconds}) * interval '1 second'
)
SELECT *
FROM servers
WHERE health_check#>>'{command}' != ''
  AND health_check#>>'{enabled}' =  'true'
`;
  //logger.debug("query=", query);
  const { rows } = await pool.query(query);
  const now = Date.now();
  const v = rows.filter(({ id, health_check }) => {
    const { periodSeconds } = validatedHealthCheck(health_check)!;
    // are we due for another health check?
    return (now - (lastHealthCheck[id] ?? 0)) / 1000 >= periodSeconds;
  });
  await map(v, PARALLEL_LIMIT, updateComputeServer);
}

async function updateComputeServer({
  id,
  account_id,
  project_id,
  health_check,
}: {
  id: number;
  account_id: string;
  project_id: string;
  health_check: HealthCheck;
}) {
  const healthCheck = validatedHealthCheck(health_check)!;
  lastHealthCheck[id] = Date.now();
  try {
    const { command, timeoutSeconds } = healthCheck;
    // run command on the compute server using the api
    let success;
    try {
      logger.debug("run check on ", { compute_server_id: id, project_id });
      const resp = await callProject({
        account_id,
        project_id,
        mesg: {
          event: "project_exec",
          project_id,
          compute_server_id: id,
          command,
          timeout: timeoutSeconds,
          bash: true,
          err_on_exit: true,
        },
      });
      if (resp.event == "error" || !!resp.exit_code) {
        throw Error("fail");
      }
      logger.debug("health check worked", { id });
      success = true;
    } catch (err) {
      logger.debug(`health check failed: ${err}`, { id });
      success = false;
    }
    if (success) {
      delete numFailures[id];
      return;
    }

    const { failureThreshold, action } = healthCheck;
    const cur = (numFailures[id] ?? 0) + 1;
    if (cur < failureThreshold) {
      logger.debug("health check failed -- but will retry:", {
        id,
        cur,
        failureThreshold,
      });
      numFailures[id] = cur;
      return;
    }
    logger.debug("health check failed  -- will do action", {
      id,
      cur,
      failureThreshold,
      action,
    });
    delete numFailures[id];
    await createProjectLogEntry({
      id,
      healthCheck,
      account_id,
      project_id,
    });
    // do the action.
    if (action == "suspend") {
      await suspend({ account_id, id });
    } else if (action == "stop") {
      await stop({ account_id, id });
    } else if (action == "reboot") {
      await reboot({ account_id, id });
    } else if (action == "deprovision") {
      await deprovision({ account_id, id });
    }
  } catch (err) {
    logger.debug(
      `WARNING - unexpected issue running health check update loop on compute server: ${err}`,
      id,
    );
  }
}

async function createProjectLogEntry({
  id,
  account_id,
  project_id,
  healthCheck,
}: {
  id: number;
  account_id: string;
  project_id: string;
  healthCheck: HealthCheck;
}) {
  const pool = getPool();
  await pool.query(
    "INSERT INTO project_log(id, project_id, account_id, time, event) VALUES($1,$2,$3,NOW(),$4)",
    [
      uuid(),
      project_id,
      account_id,
      {
        event: "compute-server",
        action: "health-check-failure",
        healthCheck,
        server_id: id,
      } as ComputeServerEventLogEntry,
    ],
  );
}
