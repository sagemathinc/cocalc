/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Code related to permanently deleting projects.
*/

import getLogger from "@cocalc/backend/logger";
import { newCounter } from "@cocalc/backend/metrics";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { minutes_ago } from "@cocalc/util/misc";
import { bulkDelete } from "./bulk-delete";
import { PostgreSQL } from "./types";

const log = getLogger("db:delete-projects");

const delete_projects_prom = newCounter(
  "database",
  "delete_projects_total",
  "Deleting projects and associated data operations counter.",
  ["op"],
);

/*
Permanently delete from the database all project records, where the
project is explicitly deleted already (so the deleted field is true).
Call this function to setup projects for permanent deletion.  This blanks
the user field so the user no longer can access the project, and we don't
know that the user had anything to do with the project.  A separate phase
later then purges these projects from disk as well as the database.

TODO:it's referenced from postgres-server-queries.coffee, but is it actually used anywhere?
*/
export async function permanently_unlink_all_deleted_projects_of_user(
  db: PostgreSQL,
  account_id_or_email_address: string,
): Promise<void> {
  // Get the account_id if necessary.
  const account_id = await get_account_id(db, account_id_or_email_address);

  // Get all of the projects for that user that are marked deleted and
  // permanently "unlink" them, i.e., set them up for permanent delete.
  await callback2(db._query, {
    query: "UPDATE projects",
    set: { users: null },
    where: ["deleted  = true", `users#>'{${account_id}}' IS NOT NULL`],
  });
}

async function get_account_id(
  db: PostgreSQL,
  account_id_or_email_address: string,
): Promise<string> {
  if (account_id_or_email_address.indexOf("@") == -1) {
    return account_id_or_email_address;
  }

  // It is an email address
  return (
    await callback2(db.get_account, {
      email_address: account_id_or_email_address,
      columns: ["account_id"],
    })
  ).account_id;
}

/*
This removes all users from all projects older than the given number of days and marked as deleted.
In particular, users are no longer able to access that project.
The "cleanup_old_projects_data" function has to run to actually get rid of the data, etc.
*/
export async function unlink_old_deleted_projects(
  db: PostgreSQL,
  age_d = 30,
): Promise<void> {
  await callback2(db._query, {
    query: "UPDATE projects",
    set: { users: null },
    where: [
      "deleted = true",
      "users IS NOT NULL",
      `last_edited <= NOW() - '${age_d} days'::INTERVAL`,
    ],
  });
}

const Q_CLEANUP_SYNCSTRINGS = `
SELECT s.string_id, p.project_id
FROM projects as p INNER JOIN syncstrings as s
  ON p.project_id = s.project_id
WHERE p.deleted = true
  AND p.users IS NULL
ORDER BY
  p.project_id, s.string_id
LIMIT 10000
`;

const Q_CLEANUP_PROJECTS = `
SELECT project_id
FROM projects
WHERE deleted = true
  AND users IS NULL
  AND state ->> 'state' != 'deleted'
ORDER BY created ASC
LIMIT 1000
`;

/*
 This more thorough delete procedure comes after the above.
 It issues actual delete operations on data of projects marked as deleted.
 When done, it sets the state.state to "deleted".

 The operations involves deleting all syncstrings of that project (and associated with that, patches),
 and only for on-prem setups, it also deletes all the data stored in the project on disk and various tables.

 This function is called every couple of hours. Hence it checks to not run longer than the given max_run_m time (minutes).
*/
export async function cleanup_old_projects_data(
  db: PostgreSQL,
  max_run_m = 60,
) {
  const settings = await getServerSettings();
  const on_prem = settings.kucalc === KUCALC_ON_PREMISES;
  const L0 = log.extend("cleanup_old_projects_data");
  const L = L0.debug;

  L("args", { max_run_m, on_prem });
  const start_ts = new Date();

  const pool = getPool();

  let numSyncStr = 0;
  let numProj = 0;

  while (true) {
    if (start_ts < minutes_ago(max_run_m)) {
      L(`too much time elapsed, breaking after ${numSyncStr} syncstrings`);
      return;
    }

    const { rows: syncstrings } = await pool.query(Q_CLEANUP_SYNCSTRINGS);
    L(`deleting ${syncstrings.length} syncstrings`);
    for (const { project_id, string_id } of syncstrings) {
      L(`deleting syncstring ${project_id}/${string_id}`);
      numSyncStr += 1;
      const t0 = Date.now();
      await callback2(db.delete_syncstring, { string_id });
      const elapsed_ms = Date.now() - t0;
      delete_projects_prom.labels("syncstring").inc();
      // wait a bit after deleting syncstrings, e.g. to let the standby db catch up
      // this ensures a max of "10%" utilization of the database – or wait 1 second
      await new Promise((done) =>
        setTimeout(done, Math.min(1000, elapsed_ms * 9)),
      );
    }

    const { rows: projects } = await pool.query(Q_CLEANUP_PROJECTS);
    L(`deleting the data of ${projects.length} projects`);
    for (const { project_id } of projects) {
      const L2 = L0.extend(project_id).debug;
      delete_projects_prom.labels("project").inc();
      numProj += 1;
      let delRows = 0;

      if (on_prem) {
        L2(`delete all project files`);
        // TODO: this only works on-prem, and requires the project files to be mounted

        L2(`deleting all shared files`);
        // TODO: do it directly like above, and also get rid of all those shares in the database

        // for now, on-prem only as well. This gets rid of all sorts of data in tables specific to the given project.
        delRows += await delete_associated_project_data(L2, project_id);
      }

      // now, that we're done with that project, mark it as state.state ->> 'deleted'
      // in addition to the flag "deleted = true"
      await callback2(db.set_project_state, {
        project_id,
        state: "deleted",
      });
      L2(
        `finished deleting project data | deleted ${delRows} entries | setting state.state="deleted"`,
      );
    }

    if (projects.length === 0 && syncstrings.length === 0) {
      L(`all data of deleted projects and associated syncstrings are deleted.`);
      L(
        `In total ${numSyncStr} syncstrings and ${numProj} projects were processed.`,
      );
      return;
    }
  }
}

async function delete_associated_project_data(
  L2,
  project_id: string,
): Promise<number> {
  let total = 0;
  // collecting tables, where the primary key is the default (i.e. "id") and
  // the field to check is always called "project_id"
  const tables = [
    "public_paths",
    "project_log",
    "file_use",
    "file_access_log",
    "jupyter_api_log",
    "openai_chatgpt_log",
  ] as const;

  for (const table of tables) {
    const { rowsDeleted } = await bulkDelete({
      table,
      field: "project_id",
      value: project_id,
    });
    total += rowsDeleted;
    L2(`deleted ${table} ${rowsDeleted} entries`);
  }

  // these tables are different, i.e. another id, or the field to check the project_id value against is called differently

  for (const field of ["target_project_id", "source_project_id"] as const) {
    const { rowsDeleted } = await bulkDelete({
      table: "copy_paths",
      field,
      value: project_id,
    });
    total += rowsDeleted;
    L2(`deleted copy_paths/${field} ${rowsDeleted} entries`);
  }

  {
    const { rowsDeleted } = await bulkDelete({
      table: "listings",
      field: "project_id",
      id: "project_id", // TODO listings has a more complex ID, is this a problem?
      value: project_id,
    });
    total += rowsDeleted;
    L2(`deleted ${rowsDeleted} listings`);
  }

  {
    const { rowsDeleted } = await bulkDelete({
      table: "project_invite_tokens",
      field: "project_id",
      value: project_id,
      id: "token",
    });
    total += rowsDeleted;
    L2(`deleted ${rowsDeleted} entries`);
  }

  return total;
}
