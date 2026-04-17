/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Code related to permanently deleting projects.
*/

import { promises as fs } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { pathToFiles } from "@cocalc/backend/files/path-to-files";
import getLogger, { WinstonLogger } from "@cocalc/backend/logger";
import { newCounter } from "@cocalc/backend/metrics";
import { homePath } from "@cocalc/backend/misc";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";
import { callback2 } from "@cocalc/util/async-utils";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { is_valid_uuid_string, minutes_ago } from "@cocalc/util/misc";
import { bulkDelete, throttledRunner } from "./bulk-delete";
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

Chunked: on installations with a backlog of tens/hundreds of thousands of
deleted projects, a single UPDATE would be one huge transaction with big WAL
burst and row locks across `projects`. Instead we update in small batches via
throttledRunner, which keeps DB utilization around COCALC_DB_BULK_DELETE_MAX_UTIL_PCT.
*/
export async function unlink_old_deleted_projects(
  db: PostgreSQL,
  age_d = 30,
): Promise<void> {
  const L = log.extend("unlink_old_deleted_projects").debug;
  const pool = getPool();
  // Chunk by primary key so each UPDATE touches at most LIMIT rows.
  const q = `
UPDATE projects SET users = NULL
WHERE project_id IN (
  SELECT project_id FROM projects
  WHERE deleted = true
    AND users IS NOT NULL
    AND last_edited <= NOW() - '${age_d} days'::INTERVAL
  LIMIT $1
)`;
  const stats = await throttledRunner(
    async (limit) => {
      const ret = await pool.query(q, [limit]);
      return ret.rowCount ?? 0;
    },
    { label: "unlink_old_deleted_projects" },
  );
  L(`unlinked projects: ${stats.rowsDeleted} in ${stats.durationS.toFixed(1)}s`);
  // we reuse the existing counter so ops can track these events
  db.log({
    event: "cleanup_deleted_projects",
    value: { op: "unlink", ...stats },
  });
}

/*
Scrub personally identifying information (PII) from accounts flagged
`deleted = true` for at least `age_d` days (default 30). At deletion time
(see server/accounts/delete.ts) we already clear `email_address` and
`passports`; this job additionally clears `first_name`, `last_name`,
`email_address_before_delete`, and the three email-verification/challenge/
problem blobs. The `accounts` row itself is kept so references to account_id
elsewhere (projects, central_log, etc.) still resolve.

Gating happens via the `deleted_at` timestamp column. Accounts that were
marked deleted before the column existed get backfilled with `NOW()` on
first run, so they get a full grace period starting at deploy time rather
than being scrubbed immediately.
*/
export async function cleanup_deleted_account_pii(
  db: PostgreSQL,
  age_d = 30,
): Promise<void> {
  const L = log.extend("cleanup_deleted_account_pii").debug;
  const pool = getPool();

  // Backfill deleted_at for legacy deleted accounts (pre-column) so they
  // still get a grace period before PII is scrubbed.
  const backfillStats = await throttledRunner(
    async (limit) => {
      const ret = await pool.query(
        `UPDATE accounts SET deleted_at = NOW()
         WHERE account_id IN (
           SELECT account_id FROM accounts
           WHERE deleted = true AND deleted_at IS NULL
           LIMIT $1
         )`,
        [limit],
      );
      return ret.rowCount ?? 0;
    },
    { label: "cleanup_deleted_account_pii/backfill" },
  );
  if (backfillStats.rowsDeleted > 0) {
    L(
      `backfilled deleted_at on ${backfillStats.rowsDeleted} legacy deleted accounts`,
    );
  }

  // Scrub PII on accounts whose deletion grace period has elapsed.
  const q = `
UPDATE accounts
SET
  first_name = '',
  last_name = '',
  email_address = NULL,
  email_address_before_delete = NULL,
  email_address_verified = NULL,
  email_address_challenge = NULL,
  email_address_problem = NULL,
  passports = NULL
WHERE account_id IN (
  SELECT account_id FROM accounts
  WHERE deleted = true
    AND deleted_at IS NOT NULL
    AND deleted_at <= NOW() - '${age_d} days'::INTERVAL
    AND (
      first_name <> ''
      OR last_name <> ''
      OR email_address IS NOT NULL
      OR email_address_before_delete IS NOT NULL
      OR email_address_verified IS NOT NULL
      OR email_address_challenge IS NOT NULL
      OR email_address_problem IS NOT NULL
      OR passports IS NOT NULL
    )
  LIMIT $1
)`;
  const stats = await throttledRunner(
    async (limit) => {
      const ret = await pool.query(q, [limit]);
      return ret.rowCount ?? 0;
    },
    { label: "cleanup_deleted_account_pii" },
  );
  L(
    `scrubbed PII from ${stats.rowsDeleted} deleted accounts in ${stats.durationS.toFixed(1)}s`,
  );
  db.log({
    event: "cleanup_deleted_projects",
    value: { op: "scrub_account_pii", ...stats },
  });
}

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
 This more thorough delete procedure comes after `unlink_old_deleted_projects`.
 It issues actual delete operations on data of projects marked as deleted.
 When done, it sets the state.state to "deleted".

 Per project we:
   1. Chunked-delete all `patches` for each syncstring of the project, then
      drop the syncstring rows. (Post-Conat, patches is typically empty, so
      the chunked pass is very fast; the code handles the pre-Conat case
      correctly too.)
   2. Clear site_license/status/last_active/run_quota on the project row.
   3. On-prem only: delete the project's files on disk (with a sanity check
      that the resolved path ends with the project_id UUID) and any shared
      files.
   4. Chunked-delete rows referencing the project_id in ~10 associated tables.
   5. Set state.state = "deleted" so the project is skipped on subsequent runs.

 This function is called every couple of hours. Hence it checks to not run
 longer than the given max_run_m time (minutes).
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

  let numProj = 0;

  while (true) {
    if (start_ts < minutes_ago(max_run_m)) {
      L(`time budget exceeded; processed ${numProj} projects so far`);
      return;
    }

    const { rows: projects } = await pool.query(Q_CLEANUP_PROJECTS);
    L(`deleting the data of ${projects.length} projects`);
    if (projects.length === 0) {
      L(`all deleted projects have been processed (${numProj} total)`);
      return;
    }

    for (const { project_id } of projects) {
      const L2 = L0.extend(project_id).debug;
      delete_projects_prom.labels("project").inc();
      numProj += 1;
      let delRows = 0;

      // 1. Delete syncstrings + their patches for this project.
      delRows += await delete_project_syncstrings(L2, project_id);

      // 2. Clean up fields *on* the project row itself.
      await pool.query(
        `UPDATE projects
         SET site_license = NULL, status = NULL, last_active = NULL, run_quota = NULL
         WHERE project_id = $1`,
        [project_id],
      );

      // 3. On-prem only: delete files from disk.
      if (on_prem) {
        db.log({
          event: "delete_project",
          value: { deleting: "files", project_id },
        });

        L2(`delete all project files`);
        await deleteProjectFiles(L2, project_id);

        try {
          // this is something like /shared/projects/${project_id}
          const shared_path = pathToFiles(project_id, "");
          assertPathContainsProjectId(shared_path, project_id);
          L2(`deleting all shared files in ${shared_path}`);
          await fs.rm(shared_path, { recursive: true, force: true });
        } catch (err) {
          L2(`Unable to delete shared files: ${err}`);
        }
      }

      // 4. Delete rows in tables that reference this project_id.
      delRows += await delete_associated_project_data(L2, project_id);
      db.log({
        event: "delete_project",
        value: { deleting: "database", project_id },
      });

      // 5. Mark project state=deleted so it's not reprocessed.
      await callback2(db.set_project_state, { project_id, state: "deleted" });
      L2(
        `finished deleting project data | deleted ${delRows} entries | state.state="deleted"`,
      );
    }
  }
}

/*
 Delete all patches + syncstring rows belonging to one project.
 Patches are chunked by ctid so the DELETE stays throttled even for a
 syncstring with millions of patches. `syncstrings` lookups by string_id use
 the primary-key index; the DELETE by string_id is a single PK-keyed
 statement and is fast regardless of row count.
*/
async function delete_project_syncstrings(
  L2: WinstonLogger["debug"],
  project_id: string,
): Promise<number> {
  const pool = getPool();
  // Uses the syncstrings.project_id index (added alongside this code path).
  const { rows: syncstrings } = await pool.query(
    "SELECT string_id FROM syncstrings WHERE project_id = $1",
    [project_id],
  );
  if (syncstrings.length === 0) return 0;

  let total = 0;
  for (const { string_id } of syncstrings) {
    // Patches primary key is compound (string_id, time, is_snapshot), so we
    // chunk by ctid (the physical row id) which is unique for every table.
    const { rowsDeleted } = await bulkDelete({
      table: "patches",
      field: "string_id",
      value: string_id,
      id: "ctid",
    });
    total += rowsDeleted;
    delete_projects_prom.labels("syncstring").inc();
    L2(`deleted ${rowsDeleted} patches for syncstring ${string_id}`);
  }

  // Drop the syncstring rows themselves. A single PK-keyed DELETE per string
  // is fast; batching gets us one round trip for the set.
  const stringIds = syncstrings.map((r) => r.string_id);
  const ret = await pool.query(
    "DELETE FROM syncstrings WHERE string_id = ANY($1::CHAR(40)[])",
    [stringIds],
  );
  total += ret.rowCount ?? 0;
  L2(`deleted ${ret.rowCount} syncstring rows`);
  return total;
}

// Guard against fs.rm walking into an unrelated tree if MOUNTED_PROJECTS_ROOT
// is misconfigured or the path template doesn't actually include [project_id].
function assertPathContainsProjectId(path: string, project_id: string): void {
  if (!is_valid_uuid_string(project_id)) {
    throw new Error(`refusing to delete path: invalid project_id`);
  }
  const resolved = resolvePath(path);
  if (!resolved.includes(project_id)) {
    throw new Error(
      `refusing to delete '${resolved}': path does not contain project_id ${project_id}`,
    );
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
    assertPathContainsProjectId(project_dir, project_id);
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
      `not deleting project files: either '${project_dir}' does not exist, is not accessible, or failed a safety check: ${err}`,
    );
  }
}
