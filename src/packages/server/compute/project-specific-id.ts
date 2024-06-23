import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:project-specific-id");

// Returns a map from the compute_server_id to the project_specific_id
// for all compute servers in a project, assigning a minimal project_specific_id
// if necessary.
// CONCURRENCY: it's possible but highly unlikely that a compute server gets
// created and assigned a project specific id during the processing below.  The
// database has a uniqueness constraint so that would result in an error, instead
// of an inconsistency.  To avoid that, **we use a transaction**, so the code below
// should always succeed, and the project specific assignment has to wait on
// the transaction.
export async function getProjectSpecificIds(
  project_id: string,
): Promise<{ [compute_server_id: number]: number }> {
  logger.debug("getProjectSpecificIds", { project_id });
  const pool = getPool();
  const client = await pool.connect();
  const done: { [compute_server_id: number]: number } = {};
  try {
    await client.query("BEGIN"); // Start transaction

    const { rows } = await client.query(
      `SELECT id as compute_server_id, project_specific_id FROM compute_servers WHERE project_id=$1 ORDER BY compute_server_id`,
      [project_id],
    );
    const todo: number[] = [];
    const used: Set<number> = new Set([]);
    for (const { compute_server_id, project_specific_id } of rows) {
      if (project_specific_id != null) {
        done[compute_server_id] = project_specific_id;
        used.add(project_specific_id);
      } else {
        // we need to assign this:
        todo.push(compute_server_id);
      }
    }
    if (todo.length == 0) {
      // typical case -- everything is already assigned
      await client.query("COMMIT"); // If everything goes correctly, does COMMIT
      return done;
    }

    const not_used: number[] = [];
    let id = 1;
    while (not_used.length < todo.length) {
      if (!used.has(id)) {
        not_used.push(id);
      }
      id += 1;
    }

    for (const compute_server_id of todo) {
      const project_specific_id = not_used.shift();
      if (project_specific_id == null) {
        // should not happen because not_used as the same size as todo.
        throw Error("bug");
      }
      done[compute_server_id] = project_specific_id;

      // Inserting the newly created project_specific_id values back into the database
      await client.query(
        `UPDATE compute_servers SET project_specific_id=$1 WHERE id=$2`,
        [project_specific_id, compute_server_id],
      );
    }

    await client.query("COMMIT"); // If everything goes correctly, does COMMIT
  } catch (err) {
    await client.query("ROLLBACK"); // If there's an error, does ROLLBACK
    throw err;
  } finally {
    client.release();
  }

  return done;
}

export async function getProjectSpecificId({
  compute_server_id,
  project_id,
}: {
  compute_server_id: number;
  project_id?: string;
}): Promise<number> {
  logger.debug("getProjectSpecificId", { compute_server_id });
  if (project_id == null) {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT project_id FROM compute_servers WHERE id=$1",
      [compute_server_id],
    );
    project_id = rows?.[0].project_id;
  }
  if (project_id == null) {
    throw Error(`no such compute server ${compute_server_id}`);
  }
  const id = (await getProjectSpecificIds(project_id))[compute_server_id];
  if (id == null) {
    throw Error("bug");
  }
  return id;
}

// do this globally manually on older servers just to ensure that the ids
// are all known going forward.
export async function assignAllProjectSpecificIds() {
  logger.debug("assignAllProjectSpecificIds");
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT DISTINCT(project_id) FROM compute_servers WHERE project_specific_id IS NULL",
  );
  logger.debug(
    "assignAllProjectSpecificIds: got ",
    rows.length,
    " projects that need some assignment",
  );
  for (const { project_id } of rows) {
    logger.debug("assignAllProjectSpecificIds: ", { project_id });
    await getProjectSpecificIds(project_id);
  }
}
