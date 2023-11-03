/*
Add a 'compute-server' event to the project's log.
These are nicely visible to the users, and provide a
record of everything that is going on regarding what
compute servers are doing.
*/

import type { ComputeServerEventLogEntry } from "@cocalc/util/compute/log";
import { getPool } from "@cocalc/database";
import { uuid } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import TTLCache from "@isaacs/ttlcache";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const logger = getLogger("server:compute:event-log");

export default async function eventLog({
  server,
  event,
}: {
  server: { project_id?: string; account_id?: string; id: number };
  event: ComputeServerEventLogEntry;
}) {
  const pool = getPool();
  try {
    const { id, project_id, account_id } = await getServer0(server);

    await pool.query(
      "INSERT INTO project_log(id,project_id,time,account_id,event) VALUES($1,$2,NOW(),$3,$4)",
      [
        uuid(),
        project_id,
        account_id,
        { ...event, event: "compute-server", server_id: id },
      ],
    );
  } catch (err) {
    logger.debug("WARNING/ERROR -- error writing to project log ", {
      server,
      event,
      err,
    });
  }
}

const cache = new TTLCache({ ttl: 5 * 60 * 1000 });

async function getServer0({
  project_id,
  account_id,
  id,
}: {
  project_id?: string;
  account_id?: string;
  id: number;
}): Promise<{ project_id: string; account_id: string; id: number }> {
  if (project_id != null && account_id != null) {
    return { id, project_id, account_id };
  }
  if (cache.has(id)) {
    return cache.get(id)!;
  }
  const v: string[] = [];
  if (project_id == null) {
    v.push("project_id");
  }
  if (account_id == null) {
    v.push("account_id");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${v.join(",")} FROM compute_servers WHERE id=$1`,
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no compute server with id ${id}`);
  }
  const x = {
    id,
    account_id: rows[0].account_id ?? account_id,
    project_id: rows[0].project_id ?? project_id,
  };
  cache.set(id, x);
  return x;
}

// Get the event log for a given server.
// Output is sorted by time from newest to oldest.
export async function getEventLog({
  id,
  account_id,
  limit = 500,
}: {
  id: number;
  account_id?: string;
  limit?: number;
}) {
  const { project_id } = await getServer0({ id });
  if (account_id != null) {
    if (!(await isCollaborator({ project_id, account_id }))) {
      throw Error(
        "user must be collaborator on project to see compute server log",
      );
    }
  }
  const pool = getPool();
  // make the equery more complicated to hopefully make it more efficient (due to indexes)
  const { rows } = await pool.query(
    `SELECT * FROM project_log WHERE project_id=$1 AND event->>'event'='compute-server' AND event->>'server_id'=$2 ORDER BY time DESC LIMIT $3`,
    [project_id, id, limit],
  );
  return rows;
}
