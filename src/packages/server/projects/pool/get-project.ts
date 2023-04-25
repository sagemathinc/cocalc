/*
Get a new project from the new project pool.

The main idea to avoid race conditions is to use a clever sql query
to -- in one operation -- set the users field for one available project
and return the project_id; if two hubs do this at once, the database
just assigns them different projects.

We thus use SQL query that does the following:  It searches the database to
find a row in the projects table for which users and deleted are both null
and last_edited is within the last 12 hours.  If it finds one such row,
it sets the jsonb field users equal to {[account_id]: {"group": "owner"}}.
It also outputs the project_id of that row.  If it doesn't find that row
it outputs no rows. (Trivial for chatgpt...)

*/

import getPool from "@cocalc/database/pool";
import { maintainNewProjectPool } from "./maintain";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("server:new-project-pool:get-project");

const query = `WITH matching_row AS (
  SELECT project_id
  FROM projects
  WHERE users IS NULL
    AND deleted IS NULL
    AND last_edited >= NOW() - INTERVAL '12 hours'
  LIMIT 1
),
updated_project AS (
  UPDATE projects
  SET users = jsonb_build_object($1::text, jsonb_build_object('group', 'owner'))
  WHERE project_id IN (SELECT project_id FROM matching_row)
  RETURNING project_id, users
)
SELECT project_id, users
FROM updated_project;`;

// input is a user and the output is a project_id
// of a running project that is set to have the account_id
// as the sole owner.  Returns null if there is nothing currently
// available in the pool.
export default async function getFromPool({
  account_id,
  title,
  description,
}: {
  account_id: string;
  title?: string;
  description?: string;
}): Promise<string | null> {
  log.debug("getting a project from the pool for ", account_id);
  const pool = getPool();
  const { rows } = await pool.query(query, [account_id]);
  if (rows.length == 0) {
    log.debug("pool is empty, so can't get anything from pool");
    return null;
  }
  try {
    // just removed something from pool, so cause more to be added to pool:
    await maintainNewProjectPool();
  } catch (err) {
    log.warn("Error maintaining pool", err);
  }
  const { project_id } = rows[0];
  if (title != null || description != null) {
    await pool.query(
      "UPDATE projects SET title=$1, description=$2 WHERE project_id=$3",
      [title ?? "", description ?? "", project_id]
    );
  }
  return project_id;
}
