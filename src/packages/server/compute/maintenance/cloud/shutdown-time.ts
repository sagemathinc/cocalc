/*
Manage shutdown time of compute servers.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { stop } from "@cocalc/server/compute/control";
import { uuid } from "@cocalc/util/misc";
import type { ComputeServerEventLogEntry } from "@cocalc/util/compute/log";
import { map } from "awaiting";
import dayjs from "dayjs";

const logger = getLogger("server:compute:maintenance:cloud:shutdown-time");

export default async function idleTimeout() {
  try {
    await update();
  } catch (err) {
    logger.debug("WARNING - issue running idle timeout update loop", err);
  }
}

async function update() {
  logger.debug("update");
  const pool = getPool();
  // finds all rows where: state is "running", idle_timeout is defined and positive,
  // last_edited_user is at least idle_timeout minutes in the past
  const { rows } = await pool.query(
    `
SELECT
  id,
  account_id,
  project_id,
  state_changed,
  (configuration#>'{shutdownTime,epochMs}')::real AS epoch_ms
FROM compute_servers
WHERE state = 'running'
  AND (configuration#>>'{shutdownTime,enabled}')::boolean = true
`,
  );
  logger.debug(
    `got ${rows.length} running servers that have shutdownTime enabled:`,
    rows,
  );
  const f = async (row) => {
    const { state_changed } = row;
    const { epoch_ms: epochMs } = row;
    const start = dayjs(state_changed); // when server started
    const now = dayjs();
    const t = dayjs(epochMs);
    let targetTime = now.hour(t.hour()).minute(t.minute()).second(t.second());
    let shutdown = false;
    if (start.isBefore(targetTime) && targetTime.isBefore(now)) {
      shutdown = true;
    }

    if (shutdown) {
      logger.debug("stopping compute server", row);
      try {
        await createProjectLogEntry(row);
        const { account_id, id } = row;
        await stop({ account_id, id });
      } catch (err) {
        logger.debug(
          `WARNING -- failed to stop ${row.id} in response to shutdown time -- ${err}`,
        );
      }
    } else {
      logger.debug("not shutting down", row);
    }
  };
  await map(rows, 20, f);
}

async function createProjectLogEntry({
  id,
  account_id,
  project_id,
  shutdownTime,
}: {
  id: number;
  account_id: string;
  project_id: string;
  shutdownTime;
}) {
  logger.debug(
    "log entry that we turned off compute server due to shutdown time",
    { id },
  );
  const pool = getPool();
  await pool.query(
    "INSERT INTO project_log(id, project_id, account_id, time, event) VALUES($1,$2,$3,NOW(),$4)",
    [
      uuid(),
      project_id,
      account_id,
      {
        event: "compute-server",
        action: "shutdown-time",
        shutdownTime,
        server_id: id,
      } as ComputeServerEventLogEntry,
    ],
  );
}
