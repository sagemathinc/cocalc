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

ORDER by created so that *oldest* project used first, since it is most
likely to be started, e.g., newest project might still be starting.


WITH matching_row AS (
  SELECT project_id
  FROM projects
  WHERE users IS NULL
    AND deleted IS NULL
    AND last_edited >= NOW() - INTERVAL '12 hours'
    ORDER BY created
  LIMIT 1
),
updated_project AS (
  UPDATE projects
  SET users = {}
  WHERE project_id IN (SELECT project_id FROM matching_row)
  RETURNING project_id, users
)
SELECT project_id, users
FROM updated_project;

*/

import getPool from "@cocalc/database/pool";
import { maintainNewProjectPool } from "./maintain";
import getLogger from "@cocalc/backend/logger";

export const maxAge = "12 hours";

const log = getLogger("server:new-project-pool:get-project");

// input is a user and the output is a project_id
// of a running project that is set to have the account_id
// as the sole owner.  Returns null if there is nothing currently
// available in the pool.
export default async function getFromPool({
  account_id,
  title,
  description,
  image,
}: {
  account_id: string;
  title?: string;
  description?: string;
  image?: string;
}): Promise<string | null> {
  log.debug("getting a project from the pool for ", account_id);

  const query = `WITH matching_row AS (
  SELECT project_id
  FROM projects
  WHERE users IS NULL
    AND deleted IS NULL ${image ? " AND compute_image=$2 " : ""}
    AND last_edited >= NOW() - INTERVAL '${maxAge}'
    ORDER BY created asc
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

  const pool = getPool();
  const { rows } = await pool.query(
    query,
    image ? [account_id, image] : [account_id]
  );
  if (rows.length == 0) {
    log.debug("pool is empty, so can't get anything from pool");
    return null;
  }
  try {
    // just removed something from pool, so refresh pool:
    await maintainNewProjectPool(1);
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
