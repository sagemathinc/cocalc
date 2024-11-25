/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Code related to permanently deleting projects.
*/

import { promises as fs } from "node:fs";

import { pathToFiles } from "@cocalc/backend/files/path-to-files";
import getLogger, { WinstonLogger } from "@cocalc/backend/logger";
import { newCounter } from "@cocalc/backend/metrics";
import { homePath } from "@cocalc/backend/misc";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { minutes_ago } from "@cocalc/util/misc";
import { bulkDelete } from "./bulk-delete";
import { PostgreSQL } from "./types";

const { F_OK, R_OK, W_OK } = fs.constants;

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

TODO: it's referenced from postgres-server-queries.coffee, but is it actually used anywhere?
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
  const L = log.extend("unlink_old_deleted_projects").debug;
  const { rowCount } = await callback2(db._query, {
    query: "UPDATE projects",
    set: { users: null },
    where: [
      "deleted = true",
      "users IS NOT NULL",
      `last_edited <= NOW() - '${age_d} days'::INTERVAL`,
    ],
  });
  L("unlinked projects:", rowCount);
}

const Q_CLEANUP_SYNCSTRINGS = `
SELECT s.string_id, p.project_id
FROM projects as p INNER JOIN syncstrings as s
  ON p.project_id = s.project_id
WHERE p.deleted = true
  AND p.users IS NULL
ORDER BY
  p.project_id, s.string_id
LIMIT 1000
`;

const Q_CLEANUP_PROJECTS = `
SELECT project_id
FROM projects
WHERE deleted = true
  AND users IS NULL
  AND coalesce(state ->> 'state', '') != 'deleted'
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
  const delete_data = settings.delete_project_data;
  const L0 = log.extend("cleanup_old_projects_data");
  const L = L0.debug;

  L("args", { max_run_m, on_prem, delete_data });

  if (!delete_data) {
    L(`deleting project data is disabled ('delete_project_data' setting).`);
    return;
  }

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

      // Clean up data *on* a given project. For now, remove all site licenses, status and last_active.
      await pool.query(
        `UPDATE projects
         SET site_license = NULL, status = NULL, last_active = NULL, run_quota = NULL
         WHERE project_id = $1`,
        [project_id],
      );

      if (on_prem) {
        // we don't delete the central_log, it has its own expiration
        // such an entry is good to have for reconstructing what really happened
        db.log({
          event: "delete_project",
          value: { deleting: "files", project_id },
        });

        L2(`delete all project files`);
        await deleteProjectFiles(L2, project_id);

        try {
          // this is something like /shared/projects/${project_id}
          const shared_path = pathToFiles(project_id, "");
          L2(`deleting all shared files in ${shared_path}`);
          await fs.rm(shared_path, { recursive: true, force: true });
        } catch (err) {
          L2(`Unable to delete shared files: ${err}`);
        }
      }

      // This gets rid of all sorts of data in tables specific to the given project.
      delRows += await delete_associated_project_data(L2, project_id);
      db.log({
        event: "delete_project",
        value: { deleting: "database", project_id },
      });

      // now, that we're done with that project, mark it as state.state ->> 'deleted'
      // in addition to the flag "deleted = true". This also updates the state.time timestamp.
      await callback2(db.set_project_state, { project_id, state: "deleted" });
      L2(
        `finished deleting project data | deleted ${delRows} entries | state.state="deleted"`,
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
  L2: WinstonLogger["debug"],
  project_id: string,
): Promise<number> {
  // TODO: two tables reference a project, but become useless.
  // There should be a fallback strategy to move these objects to another project or surface them as being orphaned.
  // tables: cloud_filesystems, compute_servers

  let total = 0;
  // collecting tables, where the primary key is the default (i.e. "id") and
  // the field to check is always called "project_id"
  const tables = [
    //"blobs", // TODO: this is a bit tricky, because data could be used elsewhere. In the future, there will be an associated account_id!
    "file_access_log",
    "file_use",
    "jupyter_api_log",
    "mentions",
    "openai_chatgpt_log",
    "project_log",
    "public_paths",
    "shopping_cart_items",
  ] as const;

  for (const table of tables) {
    const { rowsDeleted } = await bulkDelete({
      table,
      field: "project_id",
      value: project_id,
    });
    total += rowsDeleted;
    L2(`deleted in ${table}: ${rowsDeleted} entries`);
  }

  // these tables are different, i.e. another id, or the field to check the project_id value against is called differently

  for (const field of ["target_project_id", "source_project_id"] as const) {
    const { rowsDeleted } = await bulkDelete({
      table: "copy_paths",
      field,
      value: project_id,
    });
    total += rowsDeleted;
    L2(`deleted copy_paths/${field}: ${rowsDeleted} entries`);
  }

  {
    const { rowsDeleted } = await bulkDelete({
      table: "listings",
      field: "project_id",
      id: "project_id", // TODO listings has a more complex ID, which means this gets rid of everything in one go. should be fine, though.
      value: project_id,
    });
    total += rowsDeleted;
    L2(`deleted in listings: ${rowsDeleted} entries`);
  }

  {
    const { rowsDeleted } = await bulkDelete({
      table: "project_invite_tokens",
      field: "project_id",
      value: project_id,
      id: "token",
    });
    total += rowsDeleted;
    L2(`deleted in project_invite_tokens: ${rowsDeleted} entries`);
  }

  return total;
}

async function deleteProjectFiles(
  L2: WinstonLogger["debug"],
  project_id: string,
) {
  const project_dir = homePath(project_id);
  try {
    await fs.access(project_dir, F_OK | R_OK | W_OK);
    const stats = await fs.lstat(project_dir);
    if (stats.isDirectory()) {
      L2(`deleting all files in ${project_dir}`);
      await fs.rm(project_dir, { recursive: true, force: true });
    } else {
      L2(`is not a directory: ${project_dir}`);
    }
  } catch (err) {
    L2(
      `not deleting project files: either '${project_dir}' does not exist or is not accessible`,
    );
  }
}
