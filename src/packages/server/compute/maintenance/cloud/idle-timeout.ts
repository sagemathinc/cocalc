/*
Manage idle timeout of compute servers.

Call this function periodically to do the next round of checks.  Each
compute server with idle timeout configured and last_edited_user too
old gets stopped.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { stop } from "@cocalc/server/compute/control";
import { uuid } from "@cocalc/util/misc";
import type { ComputeServerEventLogEntry } from "@cocalc/util/compute/log";
import { map } from "awaiting";

const logger = getLogger("server:compute:maintenance:cloud:idle-timeout");

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
WITH servers AS (
  SELECT
    id,
    account_id,
    project_id,
    last_edited_user,
    (configuration#>'{idleTimeoutMinutes}')::integer AS idle_timeout
  FROM compute_servers
  WHERE state = 'running'
    AND (configuration#>'{idleTimeoutMinutes}') IS NOT NULL
)
SELECT *
FROM servers
WHERE idle_timeout > 0
  AND last_edited_user <= NOW() - (idle_timeout * INTERVAL '1 minute');
`,
  );
  logger.debug(`got ${rows.length} servers that need to be stopped:`, rows);
  const f = async (row) => {
    logger.debug("stopping compute server", row);
    try {
      await createProjectLogEntry(row);
      const { account_id, id } = row;
      await stop({ account_id, id });
    } catch (err) {
      logger.debug(
        `WARNING -- failed to stop ${row.id} in response to idle timeout -- ${err}`,
      );
    }
  };
  await map(rows, 20, f);
}

async function createProjectLogEntry({
  id,
  account_id,
  project_id,
  idle_timeout,
}: {
  id: number;
  account_id: string;
  project_id: string;
  idle_timeout: number;
}) {
  logger.debug("log entry that we idle timed out compute server", { id });
  const pool = getPool();
  await pool.query(
    "INSERT INTO project_log(id, project_id, account_id, time, event) VALUES($1,$2,$3,NOW(),$4)",
    [
      uuid(),
      project_id,
      account_id,
      {
        event: "compute-server",
        action: "idle-timeout",
        idle_timeout,
        server_id: id,
      } as ComputeServerEventLogEntry,
    ],
  );
}
